package handlers

import (
	"math"
	"net/http"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

var levelRank = map[string]int{
	"staff": 1, "manager": 2, "gm": 3, "executive": 4, "system_admin": 5,
}

// requireMinLevel: PERTAMA KALI field "level" (RBAC Fase 1) benar-benar
// dipakai gating -- sebelumnya cuma disimpan di JWT/context, tidak pernah
// dibaca utk otorisasi. Laporan sumber (Neraca/Laba Rugi/dst) SENGAJA TIDAK
// diubah jadi level-gated -- biar Finance staff yg sudah pakai sehari-hari
// tidak kehilangan akses. Ini genuinely proteksi BARU khusus dashboard ini.
func requireMinLevel(c *gin.Context, minLevel string) bool {
	if c.GetString("role") == "admin" {
		return true
	}
	return levelRank[c.GetString("level")] >= levelRank[minLevel]
}

type ExecutiveDashboard struct {
	From               string                        `json:"from"`
	To                 string                        `json:"to"`
	AsOf               string                        `json:"as_of"`
	TotalAssets        float64                       `json:"total_assets"`
	TotalLiabilities   float64                       `json:"total_liabilities"`
	TotalEquity        float64                       `json:"total_equity"`
	BalanceSheetOK     bool                          `json:"balance_sheet_balanced"`
	Revenue            float64                       `json:"revenue"`
	COGS               float64                       `json:"cogs"`
	GrossProfit        float64                       `json:"gross_profit"`
	Expense            float64                       `json:"expense"`
	NetIncome          float64                       `json:"net_income"`
	CashPosition       float64                       `json:"cash_position"`
	CashAccounts       []cashBankAccountRow          `json:"cash_accounts"`
	ARTotalOutstanding float64                       `json:"ar_total_outstanding"`
	ARTotalOverdue     float64                       `json:"ar_total_overdue"`
	APTotalOutstanding float64                       `json:"ap_total_outstanding"`
	APTotalOverdue     float64                       `json:"ap_total_overdue"`
	NetPosition        float64                       `json:"net_position"`
	WorstProjects      []models.ProjectProfitability `json:"worst_projects"`
}

// GetExecutiveDashboard: agregasi read-only lintas laporan yang SUDAH ADA
// (Neraca/Laba Rugi/Cash & Bank/AR-AP Aging/Project Profitability) utk
// ringkasan management -- Fase 5 area 2. Digate level>=gm (lihat
// requireMinLevel), TIDAK mengubah laporan sumber sama sekali.
func GetExecutiveDashboard(c *gin.Context) {
	if !requireMinLevel(c, "gm") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: khusus level GM ke atas"})
		return
	}

	loc := mustLoadLocation("Asia/Jakarta")
	ctx := c.Request.Context()

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
	asOf := toDate

	result := ExecutiveDashboard{
		From: fromDate.Format("2006-01-02"),
		To:   toDate.Format("2006-01-02"),
		AsOf: asOf.Format("2006-01-02"),
	}

	// --- Balance Sheet (grouped per account_type, cukup total, bukan per akun) ---
	bsRows, err := database.Pool.Query(ctx, `
		SELECT coa.account_type,
		       COALESCE(SUM(CASE WHEN je.entry_date <= $1 THEN jel.debit ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN je.entry_date <= $1 THEN jel.credit ELSE 0 END), 0)
		FROM chart_of_accounts coa
		LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
		LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
		WHERE coa.status = 'active'
		GROUP BY coa.account_type
	`, asOf)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (balance sheet)"})
		return
	}
	var bsRevenue, bsCOGS, bsExpense, equityRecorded float64
	for bsRows.Next() {
		var accountType string
		var debit, credit float64
		if err := bsRows.Scan(&accountType, &debit, &credit); err != nil {
			continue
		}
		var balance float64
		if normalBalanceFor(accountType) == "debit" {
			balance = debit - credit
		} else {
			balance = credit - debit
		}
		switch accountType {
		case "Asset":
			result.TotalAssets += balance
		case "Liability":
			result.TotalLiabilities += balance
		case "Equity":
			equityRecorded += balance
		case "Revenue":
			bsRevenue += balance
		case "COGS":
			bsCOGS += balance
		case "Expense":
			bsExpense += balance
		}
	}
	bsRows.Close()
	currentEarnings := bsRevenue - bsCOGS - bsExpense
	result.TotalEquity = equityRecorded + currentEarnings
	result.BalanceSheetOK = math.Abs(result.TotalAssets-(result.TotalLiabilities+result.TotalEquity)) < 0.01

	// --- Income Statement (company-only, grouped per account_type, periode from-to) ---
	plRows, err := database.Pool.Query(ctx, `
		SELECT coa.account_type, SUM(jel.debit), SUM(jel.credit)
		FROM journal_entry_lines jel
		JOIN journal_entries je ON je.id = jel.journal_entry_id
		JOIN chart_of_accounts coa ON coa.id = jel.account_id
		WHERE je.entry_date BETWEEN $1 AND $2
		  AND coa.account_type IN ('Revenue', 'COGS', 'Expense')
		GROUP BY coa.account_type
	`, fromDate, toDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (income statement)"})
		return
	}
	var revenue, cogs, expense float64
	for plRows.Next() {
		var accountType string
		var debit, credit float64
		if err := plRows.Scan(&accountType, &debit, &credit); err != nil {
			continue
		}
		var balance float64
		if normalBalanceFor(accountType) == "debit" {
			balance = debit - credit
		} else {
			balance = credit - debit
		}
		switch accountType {
		case "Revenue":
			revenue += balance
		case "COGS":
			cogs += balance
		case "Expense":
			expense += balance
		}
	}
	plRows.Close()
	pl := computePL(revenue, cogs, expense)
	result.Revenue = pl.Revenue
	result.COGS = pl.COGS
	result.GrossProfit = pl.GrossProfit
	result.Expense = pl.Expense
	result.NetIncome = pl.NetIncome

	// --- Cash & Bank (reuse cashAccountsCTE) ---
	cbRows, err := database.Pool.Query(ctx, cashAccountsCTE+`
		SELECT ca.id, ca.account_code, ca.account_name,
		       COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0) AS balance
		FROM cash_accounts ca
		LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
		GROUP BY ca.id, ca.account_code, ca.account_name
		ORDER BY ca.account_code
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (cash bank)"})
		return
	}
	result.CashAccounts = []cashBankAccountRow{}
	for cbRows.Next() {
		var r cashBankAccountRow
		if err := cbRows.Scan(&r.ID, &r.AccountCode, &r.AccountName, &r.Balance); err == nil {
			result.CashAccounts = append(result.CashAccounts, r)
			result.CashPosition += r.Balance
		}
	}
	cbRows.Close()

	// --- AR/AP Aging (reuse queryAgingBuckets) ---
	arQuery := `
		SELECT ` + agingBucketCaseSQL + ` AS bucket, COUNT(*), COALESCE(SUM(amount + tax_amount), 0)
		FROM invoices
		WHERE status = 'sent'
		GROUP BY bucket
	`
	ar, err := queryAgingBuckets(ctx, arQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (ar aging)"})
		return
	}
	apQuery := `
		SELECT ` + agingBucketCaseSQL + ` AS bucket, COUNT(*), COALESCE(SUM(amount), 0)
		FROM payment_schedules
		WHERE parent_type = 'vendor_po' AND status IN ('pending', 'due')
		GROUP BY bucket
	`
	ap, err := queryAgingBuckets(ctx, apQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (ap aging)"})
		return
	}
	result.ARTotalOutstanding = ar.TotalOutstanding
	result.ARTotalOverdue = ar.TotalOverdue
	result.APTotalOutstanding = ap.TotalOutstanding
	result.APTotalOverdue = ap.TotalOverdue
	result.NetPosition = ar.TotalOutstanding - ap.TotalOutstanding

	// --- Worst 5 projects by real margin (reuse profitabilityBaseQuery) ---
	worstQuery := profitabilityBaseQuery("") + ` ORDER BY (COALESCE(rev.realized,0) - COALESCE(paid_sum.actual_paid,0) - COALESCE(ac.additional_costs,0) - COALESCE(labor.labor_cost,0)) ASC LIMIT 5`
	wpRows, err := database.Pool.Query(ctx, worstQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error (worst projects)"})
		return
	}
	result.WorstProjects = []models.ProjectProfitability{}
	for wpRows.Next() {
		pp, err := scanProfitability(wpRows)
		if err == nil {
			result.WorstProjects = append(result.WorstProjects, *pp)
		}
	}
	wpRows.Close()

	c.JSON(http.StatusOK, result)
}
