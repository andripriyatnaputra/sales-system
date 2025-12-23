package models

import "time"

type PostPOStatus string

const (
	PostPONotStarted PostPOStatus = "Not Started"
	PostPOInProgress PostPOStatus = "In Progress"
	PostPODone       PostPOStatus = "Done"
)

type ProjectPostPOMonitoring struct {
	ProjectID int64 `json:"project_id"`

	Stage1Status PostPOStatus `json:"stage1_status"`
	Stage2Status PostPOStatus `json:"stage2_status"`
	Stage3Status PostPOStatus `json:"stage3_status"`
	Stage4Status PostPOStatus `json:"stage4_status"`
	Stage5Status PostPOStatus `json:"stage5_status"`

	Stage1Date *time.Time `json:"stage1_date,omitempty"`
	Stage2Date *time.Time `json:"stage2_date,omitempty"`
	Stage3Date *time.Time `json:"stage3_date,omitempty"`
	Stage4Date *time.Time `json:"stage4_date,omitempty"`
	Stage5Date *time.Time `json:"stage5_date,omitempty"`

	Stage1Note *string `json:"stage1_note,omitempty"`
	Stage2Note *string `json:"stage2_note,omitempty"`
	Stage3Note *string `json:"stage3_note,omitempty"`
	Stage4Note *string `json:"stage4_note,omitempty"`
	Stage5Note *string `json:"stage5_note,omitempty"`

	UpdatedAt time.Time `json:"updated_at"`
}
