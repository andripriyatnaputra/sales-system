package models

import "time"

// BillingRequest: META (Memo Tagih) -- permintaan Operations ke Finance
// supaya customer ditagih. Mirror PurchaseRequest (Operations minta,
// departemen lain -- di sini Finance -- yang eksekusi).
type BillingRequest struct {
	ID                  int64      `json:"id"`
	METANumber          string     `json:"meta_number"`
	SalesOrderID        int64      `json:"sales_order_id"`
	SONumber            string     `json:"so_number,omitempty"`
	RequestedBy         int64      `json:"requested_by"`
	RequestedByUsername string     `json:"requested_by_username,omitempty"`
	Status              string     `json:"status"`
	Amount              float64    `json:"amount"`
	Description         *string    `json:"description,omitempty"`
	ApprovalRequestID   *int64     `json:"approval_request_id,omitempty"`
	Notes               *string    `json:"notes,omitempty"`
	ApprovedAt          *time.Time `json:"approved_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// Invoice: dokumen resmi tagihan ke customer, dikonversi Finance dari META
// yang sudah approved. TotalAmount, IsOverdue, IssuanceAgingDays dihitung
// (bukan disimpan). IssuanceAgingDays = hari antara META (billing_request)
// approved_at dan invoice created_at -- nil kalau META sumbernya belum
// punya approved_at (data lama).
type Invoice struct {
	ID                int64      `json:"id"`
	InvoiceNumber     string     `json:"invoice_number"`
	BillingRequestID  int64      `json:"billing_request_id"`
	METANumber        string     `json:"meta_number,omitempty"`
	SalesOrderID      int64      `json:"sales_order_id"`
	SONumber          string     `json:"so_number,omitempty"`
	CustomerName      string     `json:"customer_name,omitempty"`
	Amount            float64    `json:"amount"`
	TaxAmount         float64    `json:"tax_amount"`
	TotalAmount       float64    `json:"total_amount"`
	Status            string     `json:"status"`
	IsOverdue         bool       `json:"is_overdue"`
	IssueDate         *time.Time `json:"issue_date,omitempty"`
	DueDate           *time.Time `json:"due_date,omitempty"`
	SentAt            *time.Time `json:"sent_at,omitempty"`
	PaidAt            *time.Time `json:"paid_at,omitempty"`
	CreatedBy         int64      `json:"created_by"`
	CreatedByUsername string     `json:"created_by_username,omitempty"`
	Notes             *string    `json:"notes,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	IssuanceAgingDays *int       `json:"issuance_aging_days,omitempty"`
}
