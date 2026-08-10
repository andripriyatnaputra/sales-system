package models

import "time"

// Aging (BOQAgingDays dst.) DIHITUNG di Go (bukan disimpan) dari selisih
// project.created_at ke masing-masing *_submitted_at (atau NOW() kalau
// bagian itu masih pending). nil kalau bagian sudah submitted TAPI
// *_submitted_at masih NULL -- data lama dari sebelum kolom ini ada,
// bukan bisa direkonstruksi.
type PresalesAnalysis struct {
	ID                          int64      `json:"id"`
	ProjectID                   int64      `json:"project_id"`
	SolutionSummary             *string    `json:"solution_summary,omitempty"`
	BOQStatus                   string     `json:"boq_status"`
	BOQSubmittedAt              *time.Time `json:"boq_submitted_at,omitempty"`
	BOQApprovalRequestID        *int64     `json:"boq_approval_request_id,omitempty"`
	InstallationCostStatus      string     `json:"installation_cost_status"`
	InstallationCostEstimate    *float64   `json:"installation_cost_estimate,omitempty"`
	InstallationCostSubmittedAt *time.Time `json:"installation_cost_submitted_at,omitempty"`
	VendorCostStatus            string     `json:"vendor_cost_status"`
	VendorCostEstimate          *float64   `json:"vendor_cost_estimate,omitempty"`
	VendorCostSubmittedAt       *time.Time `json:"vendor_cost_submitted_at,omitempty"`
	PnLStatus                   string     `json:"pnl_status"`
	RecommendedPrice            *float64   `json:"recommended_price,omitempty"`
	PnLSubmittedAt              *time.Time `json:"pnl_submitted_at,omitempty"`
	OverallStatus               string     `json:"overall_status"`
	ApprovalRequestID           *int64     `json:"approval_request_id,omitempty"`
	CreatedAt                   time.Time  `json:"created_at"`
	UpdatedAt                   time.Time  `json:"updated_at"`

	BOQAgingDays              *int `json:"boq_aging_days,omitempty"`
	InstallationCostAgingDays *int `json:"installation_cost_aging_days,omitempty"`
	VendorCostAgingDays       *int `json:"vendor_cost_aging_days,omitempty"`
	PnLAgingDays              *int `json:"pnl_aging_days,omitempty"`

	BOQItems []BOQItem `json:"boq_items,omitempty"`
}

// PresalesDocument: lampiran per bagian presales (ProDev/Operations/
// Procurement/Finance) -- terpisah dari ProjectDocument karena otorisasi
// upload-nya per departemen (requireDepartment), bukan per division.
type PresalesDocument struct {
	ID             int64     `json:"id"`
	ProjectID      int64     `json:"project_id"`
	Section        string    `json:"section"`
	FileName       string    `json:"file_name"`
	FileSize       *int64    `json:"file_size,omitempty"`
	UploadedBy     int64     `json:"uploaded_by"`
	UploadedByName string    `json:"uploaded_by_username,omitempty"`
	Notes          *string   `json:"notes,omitempty"`
	CreatedAt      time.Time `json:"created_at"`

	SupersedesID *int64 `json:"supersedes_id,omitempty"`
	IsLatest     bool   `json:"is_latest"`
}

type BOQItem struct {
	ID                   int64     `json:"id"`
	ProjectID            int64     `json:"project_id"`
	ItemName             string    `json:"item_name"`
	Unit                 *string   `json:"unit,omitempty"`
	Qty                  float64   `json:"qty"`
	EstimatedVendorCost  *float64  `json:"estimated_vendor_cost,omitempty"`
	EstimatedInstallCost *float64  `json:"estimated_install_cost,omitempty"`
	ProposedSellPrice    *float64  `json:"proposed_sell_price,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	CatalogItemID        *int64    `json:"catalog_item_id,omitempty"`
	SourceDocumentID     *int64    `json:"source_document_id,omitempty"`
	SourceDocumentName   string    `json:"source_document_name,omitempty"`
}
