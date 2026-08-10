package handlers

import (
	"math"
	"net/http"
	"strings"
	"time"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

type CashFlowLine struct {
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Amount      float64 `json:"amount"`
}

// CashFlowStatement: metode LANGSUNG (direct method) -- journal_entry_lines
// sudah mencatat SETIAP pergerakan Kas(1000)/Bank(1100) granular, tidak
// perlu metode tidak-langsung. Klasifikasi Operasi/Investasi/Pendanaan
// dari account_code akun LAWAN Kas/Bank dalam entry yang sama (lihat
// classifyCashFlow). Balanced = integrity check sungguhan: EndingCash
// dihitung LANGSUNG dari saldo Kas+Bank per tanggal `to`, dibandingkan
// dgn BeginningCash+NetChangeInCash (2 cara hitung berbeda, harus sama).
type CashFlowStatement struct {
	From            string         `json:"from"`
	To              string         `json:"to"`
	BeginningCash   float64        `json:"beginning_cash"`
	Operating       []CashFlowLine `json:"operating"`
	OperatingTotal  float64        `json:"operating_total"`
	Investing       []CashFlowLine `json:"investing"`
	InvestingTotal  float64        `json:"investing_total"`
	Financing       []CashFlowLine `json:"financing"`
	FinancingTotal  float64        `json:"financing_total"`
	NetChangeInCash float64        `json:"net_change_in_cash"`
	EndingCash      float64        `json:"ending_cash"`
	Balanced        bool           `json:"balanced"`
}

// classifyCashFlow: klasifikasi HARDCODE dari account_code 22 akun seed
// Langkah 1 -- kalau Finance nanti nambah akun baru yang harusnya masuk
// Investasi/Pendanaan, kode barunya wajib ditambah di sini (batasan sama
// persis dgn accountIDByCode() di gl_auto_posting.go Langkah 3).
func classifyCashFlow(accountCode string) string {
	switch accountCode {
	case "1500", "1510":
		return "investing"
	case "3000", "3100", "2300":
		return "financing"
	default:
		return "operating"
	}
}

func GetCashFlowStatement(c *gin.Context) {
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

	ctx := c.Request.Context()

	var beginningCash float64
	if err := database.Pool.QueryRow(ctx, cashAccountsCTE+`
		SELECT COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0)
		FROM journal_entry_lines jel
		JOIN journal_entries je ON je.id = jel.journal_entry_id
		JOIN cash_accounts coa ON coa.id = jel.account_id
		WHERE je.entry_date < $1
	`, fromDate).Scan(&beginningCash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var endingCash float64
	if err := database.Pool.QueryRow(ctx, cashAccountsCTE+`
		SELECT COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0)
		FROM journal_entry_lines jel
		JOIN journal_entries je ON je.id = jel.journal_entry_id
		JOIN cash_accounts coa ON coa.id = jel.account_id
		WHERE je.entry_date <= $1
	`, toDate).Scan(&endingCash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, err := database.Pool.Query(ctx, cashAccountsCTE+`
		SELECT other.account_code, other.account_name,
		       COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0) AS net_kas_impact
		FROM journal_entry_lines jel
		JOIN journal_entries je ON je.id = jel.journal_entry_id
		JOIN cash_accounts kas_coa ON kas_coa.id = jel.account_id
		JOIN LATERAL (
			SELECT coa2.id, coa2.account_code, coa2.account_name
			FROM journal_entry_lines jel2
			JOIN chart_of_accounts coa2 ON coa2.id = jel2.account_id
			WHERE jel2.journal_entry_id = jel.journal_entry_id AND jel2.id != jel.id
			ORDER BY jel2.id LIMIT 1
		) other ON true
		WHERE je.entry_date BETWEEN $1 AND $2
		  AND other.id NOT IN (SELECT id FROM cash_accounts)
		GROUP BY other.account_code, other.account_name
		ORDER BY other.account_code
	`, fromDate, toDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	result := CashFlowStatement{
		From:          fromDate.Format("2006-01-02"),
		To:            toDate.Format("2006-01-02"),
		BeginningCash: beginningCash,
		Operating:     []CashFlowLine{},
		Investing:     []CashFlowLine{},
		Financing:     []CashFlowLine{},
		EndingCash:    endingCash,
	}

	for rows.Next() {
		var code, name string
		var amount float64
		if err := rows.Scan(&code, &name, &amount); err != nil {
			continue
		}
		line := CashFlowLine{AccountCode: code, AccountName: name, Amount: amount}
		switch classifyCashFlow(code) {
		case "investing":
			result.Investing = append(result.Investing, line)
			result.InvestingTotal += amount
		case "financing":
			result.Financing = append(result.Financing, line)
			result.FinancingTotal += amount
		default:
			result.Operating = append(result.Operating, line)
			result.OperatingTotal += amount
		}
	}

	result.NetChangeInCash = result.OperatingTotal + result.InvestingTotal + result.FinancingTotal
	result.Balanced = math.Abs(result.BeginningCash+result.NetChangeInCash-result.EndingCash) < 0.01

	c.JSON(http.StatusOK, result)
}
