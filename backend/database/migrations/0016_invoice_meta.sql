-- 0016_invoice_meta.sql
-- Fase 2 langkah 1: META (Memo Tagih, Operations minta Finance menagih customer)
-- -> Invoice (Finance eksekusi). Mirror pola PR->PO yang sudah ada.
--
-- Tabel BARU `invoices`, BUKAN reuse payment_schedules (meski parent_type di
-- situ sudah punya nilai CHECK 'customer_so' yang disiapkan dulu) -- invoicing
-- butuh field yang payment_schedules tidak punya (invoice_number, tax, status
-- workflow sent/paid beda dari pending/due/paid). Nilai 'customer_so' di
-- payment_schedules jadi sengaja TIDAK TERPAKAI -- bukan bug, cuma reservasi
-- lama yang tidak jadi dipakai jalur ini.
--
-- Tidak ada UNIQUE constraint billing_request_id di invoices (1 META idealnya
-- 1 invoice, tapi tidak dipaksa -- sama pola dgn purchase_request_id di
-- purchase_orders yang juga tidak di-unique-kan).
--
-- Status "overdue" TIDAK disimpan -- dihitung saat query (status='sent' AND
-- due_date < NOW()), supaya tidak perlu cron/background job.

CREATE TABLE IF NOT EXISTS billing_requests (
    id BIGSERIAL PRIMARY KEY,
    meta_number TEXT NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id),
    requested_by BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    description TEXT,
    approval_request_id BIGINT REFERENCES approval_requests(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    billing_request_id BIGINT NOT NULL REFERENCES billing_requests(id),
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id),
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
    issue_date DATE,
    due_date DATE,
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by BIGINT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_requests_so ON billing_requests(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_request ON invoices(billing_request_id);
CREATE INDEX IF NOT EXISTS idx_invoices_so ON invoices(sales_order_id);

-- CATATAN: sengaja TIDAK seed approval_matrices utk entity_type
-- 'billing_request' -- threshold nilai & approver REAL belum dikonfirmasi
-- user (sama pola dgn presales_price_approval/purchase_request/purchase_order
-- sebelum threshold-nya dikonfirmasi). Tanpa matrix rule, submission
-- auto-approved sesuai fallback desain Approval Engine.
