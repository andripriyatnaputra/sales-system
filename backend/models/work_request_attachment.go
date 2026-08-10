package models

import "time"

type WorkRequestAttachment struct {
	ID                 int64     `json:"id"`
	WorkRequestID      int64     `json:"work_request_id"`
	FileName           string    `json:"file_name"`
	FilePath           string    `json:"-"`
	FileSize           *int64    `json:"file_size,omitempty"`
	UploadedBy         int64     `json:"uploaded_by"`
	UploadedByUsername string    `json:"uploaded_by_username,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}
