package models

import "time"

type WorkRequestTask struct {
	ID                int64      `json:"id"`
	WorkRequestID     int64      `json:"work_request_id"`
	Title             string     `json:"title"`
	IsDone            bool       `json:"is_done"`
	CreatedBy         int64      `json:"created_by"`
	CreatedByUsername string     `json:"created_by_username,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
}
