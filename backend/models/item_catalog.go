package models

import "time"

// ItemCatalog: master item/jasa standar dgn harga reference -- dipakai
// sbg picker opsional saat ProDev buat BoQ item (bukan constraint wajib).
type ItemCatalog struct {
	ID                 int64     `json:"id"`
	ItemCode           string    `json:"item_code"`
	ItemName           string    `json:"item_name"`
	Unit               *string   `json:"unit,omitempty"`
	Category           *string   `json:"category,omitempty"`
	DefaultVendorCost  *float64  `json:"default_vendor_cost,omitempty"`
	DefaultInstallCost *float64  `json:"default_install_cost,omitempty"`
	DefaultSellPrice   *float64  `json:"default_sell_price,omitempty"`
	Status             string    `json:"status"`
	Notes              *string   `json:"notes,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}
