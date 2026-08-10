package models

import "time"

// ProjectAdditionalCost: biaya/change-order di luar PO awal -- prasyarat
// Project Profitability View (Fase 2 langkah 3/4). Description bebas teks,
// tidak ada enum kategori, mirror BudgetRealization.
type ProjectAdditionalCost struct {
	ID                 int64      `json:"id"`
	ProjectID          int64      `json:"project_id"`
	Description        string     `json:"description"`
	Amount             float64    `json:"amount"`
	IncurredDate       *time.Time `json:"incurred_date,omitempty"`
	CreatedBy          int64      `json:"created_by"`
	CreatedByUsername  string     `json:"created_by_username,omitempty"`
	Notes              *string    `json:"notes,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}
