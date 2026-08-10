package models

import "time"

type SalesOrder struct {
	ID           int64     `json:"id"`
	ProjectID    int64     `json:"project_id"`
	ProjectCode  string    `json:"project_code,omitempty"`
	SONumber     string    `json:"so_number"`
	CustomerID   *int64    `json:"customer_id,omitempty"`
	CustomerName string    `json:"customer_name,omitempty"`
	TotalValue   float64   `json:"total_value"`
	Status       string    `json:"status"`
	CreatedBy    *int64    `json:"created_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	Items       []SalesOrderItem        `json:"items,omitempty"`
	CustomerPOs []CustomerPurchaseOrder `json:"customer_pos,omitempty"`
}

// CustomerPurchaseOrder: satu SPH/Sales Order bisa punya LEBIH DARI SATU PO dari
// customer -- lazim dipecah per kategori (mis. Material vs Jasa/Instalasi).
type CustomerPurchaseOrder struct {
	ID           int64      `json:"id"`
	SalesOrderID int64      `json:"sales_order_id"`
	PONumber     string     `json:"po_number"`
	PODate       *time.Time `json:"po_date,omitempty"`
	Category     *string    `json:"category,omitempty"`
	Amount       *float64   `json:"amount,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type SalesOrderItem struct {
	ID           int64     `json:"id"`
	SalesOrderID int64     `json:"sales_order_id"`
	BOQItemID    *int64    `json:"boq_item_id,omitempty"`
	ItemName     string    `json:"item_name"`
	Unit         *string   `json:"unit,omitempty"`
	Qty          float64   `json:"qty"`
	VendorCost   *float64  `json:"vendor_cost,omitempty"`
	InstallCost  *float64  `json:"install_cost,omitempty"`
	SellPrice    *float64  `json:"sell_price,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}
