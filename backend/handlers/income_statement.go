package handlers

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

type PLSummary struct {
	Revenue     float64 `json:"revenue"`
	COGS        float64 `json:"cogs"`
	GrossProfit float64 `json:"gross_profit"`
	Expense     float64 `json:"expense"`
	NetIncome   float64 `json:"net_income"`
}

type ProjectPL struct {
	ProjectID   int64  `json:"project_id"`
	ProjectCode string `json:"project_code"`
	Division    string `json:"division"`
	PLSummary
}

type DivisionPL struct {
	Division string `json:"division"`
	PLSummary
}

// IncomeStatement: GL-based (accrual) Laba Rugi, BEDA dari
// /project-profitability yang cash-basis operasional -- lihat komentar
// di handler GetIncomeStatement. Company = semua baris Revenue/COGS/Expense
// dalam periode (termasuk project_id NULL). Unassigned = SUBSET project_id
// NULL saja. ByProject/ByDivision cuma baris dgn project_id terisi.
type IncomeStatement struct {
	From       string       `json:"from"`
	To         string       `json:"to"`
	Company    PLSummary    `json:"company"`
	Unassigned PLSummary    `json:"unassigned"`
	ByProject  []ProjectPL  `json:"by_project"`
	ByDivision []DivisionPL `json:"by_division"`
}

func computePL(revenue, cogs, expense float64) PLSummary {
	grossProfit := revenue - cogs
	return PLSummary{
		Revenue:     revenue,
		COGS:        cogs,
		GrossProfit: grossProfit,
		Expense:     expense,
		NetIncome:   grossProfit - expense,
	}
}

type plAccumulator struct {
	revenue, cogs, expense float64
}

// GetIncomeStatement: Laba Rugi AKUNTANSI (accrual, dari jurnal GL) --
// Revenue diakui saat invoice 'sent', COGS diakui saat BAST vendor
// diterima (bukan saat dibayar) -- BEDA dari /project-profitability yang
// cash-basis operasional (Actual Paid dari termin yang BENAR-BENAR lunas).
// Kedua angka bisa beda, itu wajar dalam akuntansi, bukan bug.
func GetIncomeStatement(c *gin.Context) {
	loc := mustLoadLocation("Asia/Jakarta")

	fromStr := strings.TrimSpace(c.Query("from"))
	toStr := strings.TrimSpace(c.Query("to"))

	var fromDate, toDate time.Time
	if fromStr == "" && toStr == "" {
		fromDate, toDate = defaultFiscalYearRange(loc)
	} else {
		if fromStr != "" {
			if t, err := parseYearMonthOrDate(fromStr); err == nil {
				fromDate = startOfMonth(t, loc)
			}
		}
		if toStr != "" {
			if t, err := parseYearMonthOrDate(toStr); err == nil {
				toDate = endOfMonth(t, loc)
			}
		}
		if !fromDate.IsZero() && toDate.IsZero() {
			y := fromDate.In(loc).Year()
			toDate = time.Date(y, time.December, 31, 23, 59, 59, 999999999, loc)
		}
		if fromDate.IsZero() && !toDate.IsZero() {
			y := toDate.In(loc).Year()
			fromDate = time.Date(y, time.January, 1, 0, 0, 0, 0, loc)
		}
	}

	rows, err := database.Pool.Query(c, `
		SELECT jel.project_id, COALESCE(p.project_code, ''), COALESCE(p.division, ''),
		       coa.account_type, SUM(jel.debit), SUM(jel.credit)
		FROM journal_entry_lines jel
		JOIN journal_entries je ON je.id = jel.journal_entry_id
		JOIN chart_of_accounts coa ON coa.id = jel.account_id
		LEFT JOIN projects p ON p.id = jel.project_id
		WHERE je.entry_date BETWEEN $1 AND $2
		  AND coa.account_type IN ('Revenue', 'COGS', 'Expense')
		GROUP BY jel.project_id, p.project_code, p.division, coa.account_type
	`, fromDate, toDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	var companyAcc, unassignedAcc plAccumulator
	projectAcc := map[int64]*plAccumulator{}
	projectMeta := map[int64]ProjectPL{}

	for rows.Next() {
		var projectID *int64
		var projectCode, division, accountType string
		var debit, credit float64
		if err := rows.Scan(&projectID, &projectCode, &division, &accountType, &debit, &credit); err != nil {
			continue
		}

		var balance float64
		if normalBalanceFor(accountType) == "debit" {
			balance = debit - credit
		} else {
			balance = credit - debit
		}

		addTo := func(acc *plAccumulator) {
			switch accountType {
			case "Revenue":
				acc.revenue += balance
			case "COGS":
				acc.cogs += balance
			case "Expense":
				acc.expense += balance
			}
		}

		addTo(&companyAcc)
		if projectID == nil {
			addTo(&unassignedAcc)
			continue
		}

		if _, ok := projectAcc[*projectID]; !ok {
			projectAcc[*projectID] = &plAccumulator{}
			projectMeta[*projectID] = ProjectPL{ProjectID: *projectID, ProjectCode: projectCode, Division: division}
		}
		addTo(projectAcc[*projectID])
	}

	result := IncomeStatement{
		From:       fromDate.Format("2006-01-02"),
		To:         toDate.Format("2006-01-02"),
		Company:    computePL(companyAcc.revenue, companyAcc.cogs, companyAcc.expense),
		Unassigned: computePL(unassignedAcc.revenue, unassignedAcc.cogs, unassignedAcc.expense),
		ByProject:  []ProjectPL{},
		ByDivision: []DivisionPL{},
	}

	divisionAcc := map[string]*plAccumulator{}
	for pid, acc := range projectAcc {
		meta := projectMeta[pid]
		meta.PLSummary = computePL(acc.revenue, acc.cogs, acc.expense)
		result.ByProject = append(result.ByProject, meta)

		if _, ok := divisionAcc[meta.Division]; !ok {
			divisionAcc[meta.Division] = &plAccumulator{}
		}
		divisionAcc[meta.Division].revenue += acc.revenue
		divisionAcc[meta.Division].cogs += acc.cogs
		divisionAcc[meta.Division].expense += acc.expense
	}
	for div, acc := range divisionAcc {
		result.ByDivision = append(result.ByDivision, DivisionPL{Division: div, PLSummary: computePL(acc.revenue, acc.cogs, acc.expense)})
	}

	sort.Slice(result.ByProject, func(i, j int) bool {
		return result.ByProject[i].NetIncome < result.ByProject[j].NetIncome
	})
	sort.Slice(result.ByDivision, func(i, j int) bool {
		return result.ByDivision[i].Division < result.ByDivision[j].Division
	})

	c.JSON(http.StatusOK, result)
}
