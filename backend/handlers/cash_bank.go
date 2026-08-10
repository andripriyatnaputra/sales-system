package handlers

import (
	"context"
	"net/http"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

// cashAccountsCTE: akun yang dianggap "Kas/Bank" -- Kas(1000)/Bank(1100)
// itu sendiri, PLUS anak langsung keduanya (rekening spesifik yang dibuat
// via hierarki COA biasa, Fase 3 Langkah 1). Hierarki dibatasi 2 level
// (validateParent() di coa.go), jadi cukup 1 langkah child, tidak perlu
// rekursif.
const cashAccountsCTE = `
	WITH cash_accounts AS (
		SELECT id, account_code, account_name FROM chart_of_accounts
		WHERE account_code IN ('1000','1100')
		   OR parent_id IN (SELECT id FROM chart_of_accounts WHERE account_code IN ('1000','1100'))
	)
`

// isCashEquivalentAccount: dipakai UpdatePaymentSchedule/UpdateInvoiceStatus
// sebelum posting jurnal -- pastikan bank_account_id yang dipilih user
// BENAR akun Kas/Bank (atau rekening anaknya), bukan akun sembarangan.
func isCashEquivalentAccount(ctx context.Context, accountID int64) (bool, error) {
	var exists bool
	err := database.Pool.QueryRow(ctx, cashAccountsCTE+`
		SELECT EXISTS (SELECT 1 FROM cash_accounts WHERE id = $1)
	`, accountID).Scan(&exists)
	return exists, err
}

type cashBankAccountRow struct {
	ID          int64   `json:"id"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Balance     float64 `json:"balance"`
}

// GetCashBankSummary: daftar SEMUA akun Kas/Bank (termasuk rekening anak,
// mis. "1101 Bank BCA") + saldo berjalan masing-masing -- dipakai halaman
// /cash-bank DAN modal pilih rekening saat tandai lunas. LEFT JOIN sengaja
// (bukan pola Neraca yang skip saldo 0) supaya rekening baru yang belum
// ada transaksi tetap muncul sbg pilihan valid. Balance = debit-credit
// langsung (bukan lewat normalBalanceFor) krn Kas/Bank + anaknya DIJAMIN
// account_type='Asset' (debit-normal) oleh validateParent().
func GetCashBankSummary(c *gin.Context) {
	rows, err := database.Pool.Query(c, cashAccountsCTE+`
		SELECT ca.id, ca.account_code, ca.account_name,
		       COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0) AS balance
		FROM cash_accounts ca
		LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
		GROUP BY ca.id, ca.account_code, ca.account_name
		ORDER BY ca.account_code
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []cashBankAccountRow{}
	for rows.Next() {
		var r cashBankAccountRow
		if err := rows.Scan(&r.ID, &r.AccountCode, &r.AccountName, &r.Balance); err == nil {
			list = append(list, r)
		}
	}

	c.JSON(http.StatusOK, list)
}
