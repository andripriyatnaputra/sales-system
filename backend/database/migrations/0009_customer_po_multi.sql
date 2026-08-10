-- 0009_customer_po_multi.sql
-- Koreksi desain langkah 6: satu Sales Order (satu SPH) bisa punya LEBIH DARI SATU
-- PO dari customer -- contoh riil yang dikonfirmasi user 2026-07-15: customer
-- pecah PO jadi 2, satu utk material, satu lagi utk jasa/instalasi. Kolom tunggal
-- customer_po_number/customer_po_date di sales_orders (baru ditambahkan langkah 6,
-- BELUM pernah dipakai produksi) tidak cukup -- diganti tabel terpisah 1-ke-banyak.

ALTER TABLE sales_orders DROP COLUMN IF EXISTS customer_po_number;
ALTER TABLE sales_orders DROP COLUMN IF EXISTS customer_po_date;

CREATE TABLE IF NOT EXISTS customer_purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    po_date DATE,
    category TEXT, -- contoh: 'Material', 'Jasa', bebas teks, tidak di-enum-kan dulu
    amount NUMERIC(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_order_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_purchase_orders_so ON customer_purchase_orders(sales_order_id);
