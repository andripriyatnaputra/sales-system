package models

import "time"

// WorkQueueItem: satu baris di halaman "My Work" -- normalisasi lintas modul
// (presales/SO/PR/PO/BAST/payment_schedules) jadi satu bentuk generik supaya
// frontend cukup satu tabel buat semua departemen.
type WorkQueueItem struct {
	EntityType string    `json:"entity_type"`
	EntityID   int64     `json:"entity_id"`
	Code       string    `json:"code"`
	Title      string    `json:"title"`
	Detail     string    `json:"detail,omitempty"`
	Link       string    `json:"link"`
	CreatedAt  time.Time `json:"created_at"`
	Division   string    `json:"division,omitempty"`
}
