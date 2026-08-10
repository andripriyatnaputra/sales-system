package models

import "time"

// ChartOfAccount: master data akun (Fase 3 Langkah 1). NormalBalance
// (debit/credit) DIHITUNG di Go dari AccountType (bukan disimpan) --
// lihat handlers/coa.go normalBalanceFor(). ParentID opsional, dibatasi
// 2 level (parent harus top-level) dan harus AccountType yang sama --
// divalidasi di handler, bukan di skema.
type ChartOfAccount struct {
	ID            int64     `json:"id"`
	AccountCode   string    `json:"account_code"`
	AccountName   string    `json:"account_name"`
	AccountType   string    `json:"account_type"`
	ParentID      *int64    `json:"parent_id,omitempty"`
	ParentCode    string    `json:"parent_code,omitempty"`
	Status        string    `json:"status"`
	Description   *string   `json:"description,omitempty"`
	NormalBalance string    `json:"normal_balance"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
