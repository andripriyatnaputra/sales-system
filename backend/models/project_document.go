package models

import "time"

type ProjectDocument struct {
	ID             int64     `json:"id"`
	ProjectID      int64     `json:"project_id"`
	Category       string    `json:"category"`
	FileName       string    `json:"file_name"`
	FilePath       string    `json:"-"`
	FileSize       *int64    `json:"file_size,omitempty"`
	UploadedBy     int64     `json:"uploaded_by"`
	UploadedByName string    `json:"uploaded_by_username,omitempty"`
	Notes          *string   `json:"notes,omitempty"`
	CreatedAt      time.Time `json:"created_at"`

	ExpiryDate      *time.Time `json:"expiry_date,omitempty"`
	DaysUntilExpiry *int       `json:"days_until_expiry,omitempty"`

	SupersedesID *int64 `json:"supersedes_id,omitempty"`
	IsLatest     bool   `json:"is_latest"`
}
