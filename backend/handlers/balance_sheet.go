package handlers

import (
	"math"
	"net/http"
	"time"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

type BalanceSheetLine struct {
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Balance     float64 `json:"balance"`
}

// BalanceSheet: perusahaan/company-wide, BUKAN per-project/divisi (itu
// tugas Langkah 5 / Laba Rugi). CurrentEarnings = Revenue-COGS-Expense
// terakumulasi ("Laba Berjalan (belum ditutup)") -- sistem ini tidak
// punya proses tutup buku, jadi baris ini WAJIB ada di sisi Equity supaya
// Assets = Liabilities + Equity + (Revenue-COGS-Expense) tetap balance
// (identitas ini terpenuhi otomatis krn tiap journal_entries SELALU
// balance debit=credit -- lihat plan Langkah 4 utk pembuktian).
type BalanceSheet struct {
	AsOf             string             `json:"as_of"`
	Assets           []BalanceSheetLine `json:"assets"`
	TotalAssets      float64            `json:"total_assets"`
	Liabilities      []BalanceSheetLine `json:"liabilities"`
	TotalLiabilities float64            `json:"total_liabilities"`
	Equity           []BalanceSheetLine `json:"equity"`
	CurrentEarnings  float64            `json:"current_earnings"`
	TotalEquity      float64            `json:"total_equity"`
	Balanced         bool               `json:"balanced"`
}

func GetBalanceSheet(c *gin.Context) {
	asOf := time.Now()
	asOfStr := c.Query("as_of")
	if asOfStr != "" {
		parsed, err := time.Parse("2006-01-02", asOfStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "as_of harus format YYYY-MM-DD"})
			return
		}
		asOf = parsed
	}

	rows, err := database.Pool.Query(c, `
		SELECT coa.account_code, coa.account_name, coa.account_type,
		       COALESCE(SUM(CASE WHEN je.entry_date <= $1 THEN jel.debit ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN je.entry_date <= $1 THEN jel.credit ELSE 0 END), 0)
		FROM chart_of_accounts coa
		LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
		LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
		WHERE coa.status = 'active'
		GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
		ORDER BY coa.account_code
	`, asOf)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	bs := BalanceSheet{
		AsOf:        asOf.Format("2006-01-02"),
		Assets:      []BalanceSheetLine{},
		Liabilities: []BalanceSheetLine{},
		Equity:      []BalanceSheetLine{},
	}
	var revenue, cogs, expense float64

	for rows.Next() {
		var code, name, accountType string
		var debit, credit float64
		if err := rows.Scan(&code, &name, &accountType, &debit, &credit); err != nil {
			continue
		}

		var balance float64
		if normalBalanceFor(accountType) == "debit" {
			balance = debit - credit
		} else {
			balance = credit - debit
		}
		if balance == 0 {
			continue
		}

		line := BalanceSheetLine{AccountCode: code, AccountName: name, Balance: balance}
		switch accountType {
		case "Asset":
			bs.Assets = append(bs.Assets, line)
			bs.TotalAssets += balance
		case "Liability":
			bs.Liabilities = append(bs.Liabilities, line)
			bs.TotalLiabilities += balance
		case "Equity":
			bs.Equity = append(bs.Equity, line)
		case "Revenue":
			revenue += balance
		case "COGS":
			cogs += balance
		case "Expense":
			expense += balance
		}
	}

	equityRecorded := 0.0
	for _, l := range bs.Equity {
		equityRecorded += l.Balance
	}
	bs.CurrentEarnings = revenue - cogs - expense
	bs.TotalEquity = equityRecorded + bs.CurrentEarnings
	bs.Balanced = math.Abs(bs.TotalAssets-(bs.TotalLiabilities+bs.TotalEquity)) < 0.01

	c.JSON(http.StatusOK, bs)
}
