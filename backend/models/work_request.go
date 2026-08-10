package models

import "time"

type WorkRequest struct {
	ID                       int64      `json:"id"`
	Type                     string     `json:"type"`
	Title                    string     `json:"title"`
	Description              *string    `json:"description,omitempty"`
	CustomerID               *int64     `json:"customer_id,omitempty"`
	CustomerName             string     `json:"customer_name,omitempty"`
	RequestingDepartmentID   *int64     `json:"requesting_department_id,omitempty"`
	RequestingDepartmentName string     `json:"requesting_department_name,omitempty"`
	Status                   string     `json:"status"`
	TargetDate               *time.Time `json:"target_date,omitempty"`
	Notes                    *string    `json:"notes,omitempty"`
	RequestedBy              int64      `json:"requested_by"`
	RequestedByUsername      string     `json:"requested_by_username,omitempty"`
	CreatedAt                time.Time  `json:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
	AttachmentCount          int        `json:"attachment_count"`
	UpdateCount              int        `json:"update_count"`
	TaskCount                int        `json:"task_count"`
	TaskDoneCount            int        `json:"task_done_count"`
}
