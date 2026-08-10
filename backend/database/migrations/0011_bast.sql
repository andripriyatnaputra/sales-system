-- 0011_bast.sql
-- Fase 1 langkah 8 (penutup Fase 1): BAST Vendor (goods receipt, verifikasi Ops
-- barang/jasa dari vendor sesuai PO) & BAST Customer (serah terima ke customer,
-- jadi trigger Fase 2/invoicing nanti). Additive.
--
-- BAST Vendor & BAST Customer SENGAJA independen satu sama lain -- tidak semua
-- SO item melalui procurement vendor (ada yang murni jasa internal), jadi BAST
-- Customer tidak di-gate harus ada BAST Vendor dulu.
--
-- Link BAST Vendor -> payment_schedules SENGAJA manual (trigger_payment_schedule_ids
-- dipilih user saat create BAST, bukan auto-parse trigger_description yang bebas
-- teks) -- Ops/Procurement yang menilai termin mana yang terpicu oleh BAST ini.

CREATE TABLE IF NOT EXISTS bast_vendor (
    id BIGSERIAL PRIMARY KEY,
    bast_number TEXT NOT NULL UNIQUE,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id),
    received_by BIGINT NOT NULL REFERENCES users(id),
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'complete',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bast_vendor_status_check CHECK (status IN ('complete', 'partial'))
);

CREATE TABLE IF NOT EXISTS bast_vendor_items (
    id BIGSERIAL PRIMARY KEY,
    bast_vendor_id BIGINT NOT NULL REFERENCES bast_vendor(id) ON DELETE CASCADE,
    purchase_order_item_id BIGINT NOT NULL REFERENCES purchase_order_items(id),
    qty_received NUMERIC(18,2) NOT NULL,
    condition_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bast_customer (
    id BIGSERIAL PRIMARY KEY,
    bast_number TEXT NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id),
    delivered_by BIGINT NOT NULL REFERENCES users(id),
    delivered_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'complete',
    customer_signatory TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bast_customer_status_check CHECK (status IN ('complete', 'partial'))
);

CREATE TABLE IF NOT EXISTS bast_customer_items (
    id BIGSERIAL PRIMARY KEY,
    bast_customer_id BIGINT NOT NULL REFERENCES bast_customer(id) ON DELETE CASCADE,
    sales_order_item_id BIGINT NOT NULL REFERENCES sales_order_items(id),
    qty_delivered NUMERIC(18,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bast_vendor_po ON bast_vendor(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_bast_vendor_items_bast ON bast_vendor_items(bast_vendor_id);
CREATE INDEX IF NOT EXISTS idx_bast_customer_so ON bast_customer(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_bast_customer_items_bast ON bast_customer_items(bast_customer_id);
