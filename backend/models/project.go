package models

import "time"

// Tambahkan / update struct RevenuePlanRequest
type RevenuePlanRequest struct {
	Month             string   `json:"month"` // format: YYYY-MM
	TargetRevenue     float64  `json:"target_revenue"`
	SPHRevenue        *float64 `json:"sph_revenue,omitempty"`
	TargetRealization float64  `json:"target_realization"` // NEW, optional di JSON (default 0)
}

type Project struct {
	ID                      int64      `json:"id"`
	ProjectCode             string     `json:"project_code"`
	Description             string     `json:"description"`
	CustomerID              *int64     `json:"customer_id,omitempty"`
	CustomerName            string     `json:"customer_name,omitempty"` // baru, dipakai di list & detail
	Division                string     `json:"division"`
	Status                  string     `json:"status"`
	ProjectType             string     `json:"project_type"`
	PipelineStatus          string     `json:"pipeline_status"`
	SPHStatus               *string    `json:"sph_status,omitempty"`
	SPHRelease              *time.Time `json:"sph_release_date,omitempty"`
	SalesStage              int        `json:"sales_stage"`
	SPHReleaseStatus        string     `json:"sph_release_status"`
	SPHNumber               *string    `json:"sph_number"`
	SPHStatusReasonCategory *string    `json:"sph_status_reason_category,omitempty"`
	SPHStatusReasonNote     *string    `json:"sph_status_reason_note,omitempty"`
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`
}

type ProjectSummaryResponse struct {
	TotalProjects       int64 `json:"total_projects"`
	ProspectProjects    int64 `json:"prospect_projects"`
	ClosingProjects     int64 `json:"closing_projects"`
	InExecutionProjects int64 `json:"in_execution_projects"`
	CompletedProjects   int64 `json:"completed_projects"`
	TotalTargetRevenue  int64 `json:"total_target_revenue"`
}

type ProjectPipelineStageSummary struct {
	Stage            int     `json:"stage"`
	Label            string  `json:"label"`
	Count            int64   `json:"count"`
	TargetValue      float64 `json:"target_value"`
	SPHValue         float64 `json:"sph_value"`
	RealizationValue float64 `json:"realization_value"`
	AvgTargetValue   float64 `json:"avg_target_value"`

	HoldCount int64   `json:"hold_count"`
	HoldValue float64 `json:"hold_value"`
	LossCount int64   `json:"loss_count"`
	LossValue float64 `json:"loss_value"`
	DropCount int64   `json:"drop_count"`
	DropValue float64 `json:"drop_value"`
}

type ProjectPipelineSummaryResponse struct {
	TotalProjects    int64                         `json:"total_projects"`
	TotalTargetValue float64                       `json:"total_target_value"`
	TotalRealization float64                       `json:"total_realization"`
	AvgDealSize      float64                       `json:"avg_deal_size"`
	Stages           []ProjectPipelineStageSummary `json:"stages"`
}

type ProjectPipelineDetailItem struct {
	ID                      int64      `json:"id"`
	ProjectCode             string     `json:"project_code"`
	Description             string     `json:"description"`
	CustomerName            string     `json:"customer_name"`
	Division                string     `json:"division"`
	Status                  string     `json:"status"`
	ProjectType             string     `json:"project_type"`
	PipelineStatus          string     `json:"pipeline_status"`
	SalesStage              int        `json:"sales_stage"`
	SPHReleaseStatus        string     `json:"sph_release_status"`
	SPHStatus               *string    `json:"sph_status,omitempty"`
	SPHNumber               *string    `json:"sph_number,omitempty"`
	SPHReleaseDate          *time.Time `json:"sph_release_date,omitempty"`
	SPHStatusReasonCategory *string    `json:"sph_status_reason_category,omitempty"`
	SPHStatusReasonNote     *string    `json:"sph_status_reason_note,omitempty"`
	TargetValue             float64    `json:"target_value"`
	SPHValue                float64    `json:"sph_value"`
	RealizationValue        float64    `json:"realization_value"`
	StartMonth              *string    `json:"start_month,omitempty"`
	EndMonth                *string    `json:"end_month,omitempty"`
}

type ProjectSPHStatusSummary struct {
	Status         string  `json:"status"`
	Count          int64   `json:"count"`
	TargetValue    float64 `json:"target_value"`
	AvgTargetValue float64 `json:"avg_target_value"`
}

type ProjectSPHAgingBucket struct {
	Label       string  `json:"label"`
	Count       int64   `json:"count"`
	TargetValue float64 `json:"target_value"`
}

type ProjectSPHSummaryResponse struct {
	ReleasedCount      int64                     `json:"released_count"`
	InitialTargetValue float64                   `json:"initial_target_value"`
	SPHValue           float64                   `json:"sph_value"`
	VarianceValue      float64                   `json:"variance_value"`
	RealizationValue   float64                   `json:"realization_value"`
	ConversionRate     float64                   `json:"conversion_rate"`
	Statuses           []ProjectSPHStatusSummary `json:"statuses"`
	Aging              []ProjectSPHAgingBucket   `json:"aging"`
	Reasons            []ProjectSPHReasonSummary `json:"reasons"`
}

type ProjectSPHReasonSummary struct {
	Reason      string  `json:"reason"`
	Count       int64   `json:"count"`
	SPHValue    float64 `json:"sph_value"`
	TargetValue float64 `json:"target_value"`
}
