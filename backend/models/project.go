package models

import "time"

// Tambahkan / update struct RevenuePlanRequest
type RevenuePlanRequest struct {
	Month             string  `json:"month"` // format: YYYY-MM
	TargetRevenue     float64 `json:"target_revenue"`
	TargetRealization float64 `json:"target_realization"` // NEW, optional di JSON (default 0)
}

type Project struct {
	ID               int64      `json:"id"`
	ProjectCode      string     `json:"project_code"`
	Description      string     `json:"description"`
	CustomerID       *int64     `json:"customer_id,omitempty"`
	CustomerName     string     `json:"customer_name,omitempty"` // baru, dipakai di list & detail
	Division         string     `json:"division"`
	Status           string     `json:"status"`
	ProjectType      string     `json:"project_type"`
	SPHStatus        *string    `json:"sph_status,omitempty"`
	SPHRelease       *time.Time `json:"sph_release_date,omitempty"`
	SalesStage       int        `json:"sales_stage"`
	SPHReleaseStatus string     `json:"sph_release_status"`
	SPHNumber        *string    `json:"sph_number"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type ProjectSummaryResponse struct {
	TotalProjects       int64 `json:"total_projects"`
	ProspectProjects    int64 `json:"prospect_projects"`
	ClosingProjects     int64 `json:"closing_projects"`
	InExecutionProjects int64 `json:"in_execution_projects"`
	CompletedProjects   int64 `json:"completed_projects"`
	TotalTargetRevenue  int64 `json:"total_target_revenue"`
}
