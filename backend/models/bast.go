package models

import "time"

// TurnaroundDays: hari antara purchase_orders.approved_at (PO sumber BAST
// ini) dan bast_vendor.created_at -- DIHITUNG, bukan disimpan. nil kalau
// PO sumbernya belum punya approved_at (data lama).
type BASTVendor struct {
	ID              int64     `json:"id"`
	BASTNumber      string    `json:"bast_number"`
	PurchaseOrderID int64     `json:"purchase_order_id"`
	PONumber        string    `json:"po_number,omitempty"`
	ReceivedBy      int64     `json:"received_by"`
	ReceivedByName  string    `json:"received_by_username,omitempty"`
	ReceivedDate    time.Time `json:"received_date"`
	Status          string    `json:"status"`
	Notes           *string   `json:"notes,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	TurnaroundDays  *int      `json:"turnaround_days,omitempty"`

	Items []BASTVendorItem `json:"items,omitempty"`
}

type BASTVendorItem struct {
	ID                  int64     `json:"id"`
	BASTVendorID        int64     `json:"bast_vendor_id"`
	PurchaseOrderItemID int64     `json:"purchase_order_item_id"`
	ItemName            string    `json:"item_name,omitempty"`
	QtyReceived         float64   `json:"qty_received"`
	ConditionNotes      *string   `json:"condition_notes,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
}

// TurnaroundDays: hari antara sales_orders.created_at (SO terkait) dan
// bast_customer.created_at -- DIHITUNG, bukan disimpan. Tidak nullable
// (sales_orders.created_at selalu ada, tidak seperti approved_at di PO/PR).
type BASTCustomer struct {
	ID                int64     `json:"id"`
	BASTNumber        string    `json:"bast_number"`
	SalesOrderID      int64     `json:"sales_order_id"`
	SONumber          string    `json:"so_number,omitempty"`
	DeliveredBy       int64     `json:"delivered_by"`
	DeliveredByName   string    `json:"delivered_by_username,omitempty"`
	DeliveredDate     time.Time `json:"delivered_date"`
	Status            string    `json:"status"`
	CustomerSignatory *string   `json:"customer_signatory,omitempty"`
	Notes             *string   `json:"notes,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
	TurnaroundDays    int       `json:"turnaround_days"`

	Items []BASTCustomerItem `json:"items,omitempty"`
}

type BASTCustomerItem struct {
	ID               int64     `json:"id"`
	BASTCustomerID   int64     `json:"bast_customer_id"`
	SalesOrderItemID int64     `json:"sales_order_item_id"`
	ItemName         string    `json:"item_name,omitempty"`
	QtyDelivered     float64   `json:"qty_delivered"`
	Notes            *string   `json:"notes,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}
