package models

import "time"

// JournalEntry: header jurnal umum. SEKALI diposting bersifat IMMUTABLE --
// tidak ada Update/Delete di handler (koreksi lewat jurnal pembalik baru).
// TotalDebit/TotalCredit DIHITUNG (SUM dari Lines), tidak disimpan sbg kolom
// -- harus selalu sama krn invarian double-entry (divalidasi saat create).
type JournalEntry struct {
	ID                int64     `json:"id"`
	EntryNumber       string    `json:"entry_number"`
	EntryDate         time.Time `json:"entry_date"`
	Description       string    `json:"description"`
	SourceType        string    `json:"source_type"`
	SourceID          *int64    `json:"source_id,omitempty"`
	CreatedBy         int64     `json:"created_by"`
	CreatedByUsername string    `json:"created_by_username,omitempty"`
	TotalDebit        float64   `json:"total_debit"`
	TotalCredit       float64   `json:"total_credit"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`

	Lines []JournalEntryLine `json:"lines,omitempty"`
}

type JournalEntryLine struct {
	ID             int64     `json:"id"`
	JournalEntryID int64     `json:"journal_entry_id"`
	AccountID      int64     `json:"account_id"`
	AccountCode    string    `json:"account_code,omitempty"`
	AccountName    string    `json:"account_name,omitempty"`
	ProjectID      *int64    `json:"project_id,omitempty"`
	ProjectCode    string    `json:"project_code,omitempty"`
	Debit          float64   `json:"debit"`
	Credit         float64   `json:"credit"`
	Memo           *string   `json:"memo,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}
