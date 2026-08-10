package models

import "time"

type PurchaseRequest struct {
	ID                  int64      `json:"id"`
	PRNumber            string     `json:"pr_number"`
	SalesOrderID        int64      `json:"sales_order_id"`
	SONumber            string     `json:"so_number,omitempty"`
	RequestedBy         int64      `json:"requested_by"`
	RequestedByUsername string     `json:"requested_by_username,omitempty"`
	Status              string     `json:"status"`
	TotalEstimatedValue float64    `json:"total_estimated_value"`
	ApprovalRequestID   *int64     `json:"approval_request_id,omitempty"`
	Notes               *string    `json:"notes,omitempty"`
	ApprovedAt          *time.Time `json:"approved_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`

	Items []PurchaseRequestItem `json:"items,omitempty"`
}

type PurchaseRequestItem struct {
	ID                int64     `json:"id"`
	PurchaseRequestID int64     `json:"purchase_request_id"`
	SalesOrderItemID  int64     `json:"sales_order_item_id"`
	ItemName          string    `json:"item_name"`
	Unit              *string   `json:"unit,omitempty"`
	Qty               float64   `json:"qty"`
	EstimatedUnitCost *float64  `json:"estimated_unit_cost,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// POCreationAgingDays: hari antara purchase_requests.approved_at (PR yang
// jadi sumber PO ini) dan purchase_orders.created_at -- DIHITUNG, bukan
// disimpan. nil kalau PR sumbernya belum punya approved_at (data lama).
type PurchaseOrder struct {
	ID                  int64      `json:"id"`
	PONumber            string     `json:"po_number"`
	PurchaseRequestID   int64      `json:"purchase_request_id"`
	PRNumber            string     `json:"pr_number,omitempty"`
	PRApprovedAt        *time.Time `json:"pr_approved_at,omitempty"`
	VendorID            int64      `json:"vendor_id"`
	VendorName          string     `json:"vendor_name,omitempty"`
	CreatedBy           int64      `json:"created_by"`
	Status              string     `json:"status"`
	TotalValue          float64    `json:"total_value"`
	ApprovalRequestID   *int64     `json:"approval_request_id,omitempty"`
	Notes               *string    `json:"notes,omitempty"`
	ApprovedAt          *time.Time `json:"approved_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	POCreationAgingDays *int       `json:"po_creation_aging_days,omitempty"`

	Items            []PurchaseOrderItem `json:"items,omitempty"`
	PaymentSchedules []PaymentSchedule   `json:"payment_schedules,omitempty"`
}

type PurchaseOrderItem struct {
	ID                    int64     `json:"id"`
	PurchaseOrderID       int64     `json:"purchase_order_id"`
	PurchaseRequestItemID *int64    `json:"purchase_request_item_id,omitempty"`
	ItemName              string    `json:"item_name"`
	Unit                  *string   `json:"unit,omitempty"`
	Qty                   float64   `json:"qty"`
	UnitCost              float64   `json:"unit_cost"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// PaymentSchedule: generik, ParentType CHECK mengizinkan "vendor_po" atau
// "customer_so", tapi HANYA "vendor_po" (AP) yang benar-benar dipakai --
// invoicing customer (AR, Fase 2 langkah 1) punya tabel sendiri (`invoices`),
// bukan lewat parent_type='customer_so' yang sempat direncanakan awal. Skema
// termin bebas dikonfigurasi per transaksi.
//
// ProofFileName/DaysOverdue (Fase 2 langkah 2): DaysOverdue DIHITUNG di query,
// bukan disimpan. ProofFilePath SENGAJA tidak di-expose ke JSON (path disk
// internal, cuma dipakai server-side di handler download).
type PaymentSchedule struct {
	ID                 int64      `json:"id"`
	ParentType         string     `json:"parent_type"`
	ParentID           int64      `json:"parent_id"`
	Sequence           int        `json:"sequence"`
	TriggerDescription *string    `json:"trigger_description,omitempty"`
	Percentage         *float64   `json:"percentage,omitempty"`
	Amount             float64    `json:"amount"`
	Status             string     `json:"status"`
	DueDate            *time.Time `json:"due_date,omitempty"`
	PaidAt             *time.Time `json:"paid_at,omitempty"`
	ProofFileName      string     `json:"proof_file_name,omitempty"`
	ProofFilePath      string     `json:"-"`
	DaysOverdue        int        `json:"days_overdue"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}
