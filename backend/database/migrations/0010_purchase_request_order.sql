-- 0010_purchase_request_order.sql
-- Fase 1 langkah 7: Purchase Request (Ops) -> Purchase Order + payment_schedules
-- (Procurement), pakai Approval Engine (langkah 3) & Vendor master (langkah 4).
-- Additive.
--
-- Traceability chain ditegakkan: boq_items -> sales_order_items -> purchase_request_items
-- (WAJIB pilih dari sales_order_items yang ada, bukan input bebas -- Ops tidak
-- input ulang item, cuma pilih mana yang perlu dibeli dari vendor) -> purchase_order_items.
--
-- payment_schedules GENERIK (parent_type polymorphic: 'vendor_po' sekarang,
-- 'customer_so' menyusul Fase 2 invoicing) -- skema termin BEBAS dikonfigurasi
-- per transaksi (DP/progress/pelunasan, atau 100% setelah BAST, dst), sesuai
-- kesepakatan bahwa skema pembayaran bervariasi per project (bukan hardcode
-- satu pola).

CREATE TABLE IF NOT EXISTS purchase_requests (
    id BIGSERIAL PRIMARY KEY,
    pr_number TEXT NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id),
    requested_by BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft',
    total_estimated_value NUMERIC(18,2) NOT NULL DEFAULT 0,
    approval_request_id BIGINT REFERENCES approval_requests(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_requests_status_check CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    sales_order_item_id BIGINT NOT NULL REFERENCES sales_order_items(id),
    item_name TEXT NOT NULL,
    unit TEXT,
    qty NUMERIC(18,2) NOT NULL DEFAULT 1,
    estimated_unit_cost NUMERIC(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id),
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    created_by BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft',
    total_value NUMERIC(18,2) NOT NULL DEFAULT 0,
    approval_request_id BIGINT REFERENCES approval_requests(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    purchase_request_item_id BIGINT REFERENCES purchase_request_items(id),
    item_name TEXT NOT NULL,
    unit TEXT,
    qty NUMERIC(18,2) NOT NULL DEFAULT 1,
    unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_schedules (
    id BIGSERIAL PRIMARY KEY,
    parent_type TEXT NOT NULL,
    parent_id BIGINT NOT NULL,
    sequence INT NOT NULL,
    trigger_description TEXT,
    percentage NUMERIC(5,2),
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    due_date DATE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_schedules_parent_type_check CHECK (parent_type IN ('vendor_po', 'customer_so')),
    CONSTRAINT payment_schedules_status_check CHECK (status IN ('pending', 'due', 'paid')),
    UNIQUE (parent_type, parent_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_pr ON purchase_request_items(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_parent ON payment_schedules(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pr ON purchase_orders(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_so ON purchase_requests(sales_order_id);

-- CATATAN: sengaja TIDAK seed approval_matrices untuk entity_type
-- 'purchase_request' / 'purchase_order' -- threshold nilai & role approver REAL
-- belum dikonfirmasi user (sama seperti presales_price_approval di langkah 5).
-- Tanpa matrix rule, keduanya auto-approved sesuai desain fallback Approval Engine.
