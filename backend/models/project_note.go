package models

import "time"

type ProjectNote struct {
	ID             int64     `json:"id"`
	ProjectID      int64     `json:"project_id"`
	AuthorID       int64     `json:"author_id"`
	AuthorUsername string    `json:"author_username,omitempty"`
	Note           string    `json:"note"`
	CreatedAt      time.Time `json:"created_at"`
}
