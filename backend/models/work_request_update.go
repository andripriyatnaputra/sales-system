package models

import "time"

type WorkRequestUpdate struct {
	ID             int64     `json:"id"`
	WorkRequestID  int64     `json:"work_request_id"`
	AuthorID       int64     `json:"author_id"`
	AuthorUsername string    `json:"author_username,omitempty"`
	Note           string    `json:"note"`
	CreatedAt      time.Time `json:"created_at"`
}
