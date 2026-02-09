package models

type RevenuePlanItem struct {
	Month         string  `json:"month"`          // YYYY-MM
	TargetRevenue float64 `json:"target_revenue"` // IDR
}

type CreateProjectRequest struct {
	Description             string            `json:"description" binding:"required"`
	CustomerID              *int64            `json:"customer_id"`
	Division                string            `json:"division" binding:"required"`
	Status                  string            `json:"status" binding:"required"`
	ProjectType             string            `json:"project_type" binding:"required"`
	SPHStatus               *string           `json:"sph_status"`
	SPHRelease              *string           `json:"sph_release_date"` // 2025-01-15
	SalesStage              int               `json:"sales_stage"`
	SphReleaseStatus        string            `json:"sph_release_status"`
	SphNumber               *string           `json:"sph_number"`
	SPHStatusReasonCategory *string           `json:"sph_status_reason_category,omitempty"`
	SPHStatusReasonNote     *string           `json:"sph_status_reason_note,omitempty"`
	RevenuePlans            []RevenuePlanItem `json:"revenue_plans"`
}
