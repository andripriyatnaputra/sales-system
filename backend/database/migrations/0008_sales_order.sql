-- 0008_sales_order.sql
-- Fase 1 langkah 6: Sales Order otomatis dari Closing (sph_status='Win').
-- Additive. TIDAK ADA endpoint create manual -- SO cuma dibuat otomatis oleh
-- ensureSalesOrderForProject() (handlers/sales_order.go), dipanggil dari
-- project_create.go & project_update.go saat sph_status jadi 'Win'. Idempoten:
-- project_id UNIQUE, dicek exists dulu sebelum insert, jadi aman dipanggil ulang.
--
-- sales_order_items adalah SNAPSHOT dari boq_items pada saat closing (bukan live
-- reference) -- supaya perubahan boq_items belakangan tidak diam-diam mengubah
-- nilai SO yang sudah closing. boq_item_id tetap disimpan buat traceability.

CREATE TABLE IF NOT EXISTS sales_orders (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    so_number TEXT NOT NULL UNIQUE,
    customer_id BIGINT REFERENCES customers(id),
    customer_po_number TEXT,
    customer_po_date DATE,
    total_value NUMERIC(18,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sales_orders_status_check CHECK (status IN ('active', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id BIGSERIAL PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    boq_item_id BIGINT REFERENCES boq_items(id),
    item_name TEXT NOT NULL,
    unit TEXT,
    qty NUMERIC(18,2) NOT NULL DEFAULT 1,
    vendor_cost NUMERIC(18,2),
    install_cost NUMERIC(18,2),
    sell_price NUMERIC(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_so ON sales_order_items(sales_order_id);

INSERT INTO permissions (key, description) VALUES
    ('sales_orders.manage', 'Update metadata Sales Order (PO customer, cancel, dst)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'system_admin' AND p.key = 'sales_orders.manage'
ON CONFLICT DO NOTHING;
