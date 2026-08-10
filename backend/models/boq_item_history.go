package models

import "time"

type BOQItemHistory struct {
	ID                   int64     `json:"id"`
	BOQItemID            int64     `json:"boq_item_id"`
	ItemName             string    `json:"item_name"`
	Unit                 *string   `json:"unit,omitempty"`
	Qty                  *float64  `json:"qty,omitempty"`
	EstimatedVendorCost  *float64  `json:"estimated_vendor_cost,omitempty"`
	EstimatedInstallCost *float64  `json:"estimated_install_cost,omitempty"`
	ProposedSellPrice    *float64  `json:"proposed_sell_price,omitempty"`
	SourceDocumentID     *int64    `json:"source_document_id,omitempty"`
	SourceDocumentName   string    `json:"source_document_name,omitempty"`
	ChangedBy            int64     `json:"changed_by"`
	ChangedByUsername    string    `json:"changed_by_username,omitempty"`
	ChangedAt            time.Time `json:"changed_at"`
}
