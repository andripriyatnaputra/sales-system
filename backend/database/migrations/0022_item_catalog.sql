-- 0022_item_catalog.sql
-- Fase 4 Langkah 1: Katalog Item/Jasa & Price List. item_code AUTO-GENERATE
-- (ITM-%04d, pola sama vendors) -- katalog item tidak punya skema
-- penomoran bermakna seperti akun akuntansi. Soft-delete (status) TANPA
-- blocking-check-child (beda dari chart_of_accounts yang hierarkis) --
-- item_catalog FLAT, boq_items lama yang sudah pakai catalog_item_id tetap
-- valid walau item katalognya dinonaktifkan belakangan.
--
-- catalog_item_id di boq_items OPSIONAL (nullable) -- picker/convenience,
-- BUKAN constraint baru. item_name/unit/dst di boq_items TETAP teks bebas
-- seperti sebelumnya, tidak wajib pilih dari katalog.

CREATE TABLE item_catalog (
    id BIGSERIAL PRIMARY KEY,
    item_code TEXT NOT NULL UNIQUE,
    item_name TEXT NOT NULL,
    unit TEXT,
    category TEXT,
    default_vendor_cost NUMERIC(18,2),
    default_install_cost NUMERIC(18,2),
    default_sell_price NUMERIC(18,2),
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT item_catalog_status_check CHECK (status IN ('active','inactive'))
);

ALTER TABLE boq_items ADD COLUMN catalog_item_id BIGINT REFERENCES item_catalog(id);
