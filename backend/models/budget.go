package models

import "time"

type Budget struct {
	ID           int64     `json:"id"`
	Division     string    `json:"division"`
	Month        string    `json:"month"` // YYYY-MM
	BudgetAmount float64   `json:"budget_amount"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// computed fields
	TotalRealization float64 `json:"total_realization,omitempty"`
	Remaining        float64 `json:"remaining,omitempty"`
	Achievement      float64 `json:"achievement,omitempty"`
}

type BudgetRealization struct {
	ID        int64     `json:"id"`
	BudgetID  int64     `json:"budget_id"`
	Category  string    `json:"category"`
	Amount    float64   `json:"amount"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateBudgetRequest struct {
	Division     string  `json:"division" binding:"required"`
	Month        string  `json:"month" binding:"required"` // YYYY-MM
	BudgetAmount float64 `json:"budget_amount"`
}

type UpdateBudgetRequest struct {
	BudgetAmount float64 `json:"budget_amount"`
}

type AddRealizationRequest struct {
	Category string  `json:"category" binding:"required"`
	Amount   float64 `json:"amount" binding:"required"`
	Note     string  `json:"note"`
}
