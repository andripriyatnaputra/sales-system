package models

import "time"

type Timesheet struct {
	ID          int64     `json:"id"`
	ProjectID   int64     `json:"project_id"`
	ProjectCode string    `json:"project_code,omitempty"`
	UserID      int64     `json:"user_id"`
	Username    string    `json:"username,omitempty"`
	WorkDate    time.Time `json:"work_date"`
	Hours       float64   `json:"hours"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
