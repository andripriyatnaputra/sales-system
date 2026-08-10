-- 0006_vendor_master.sql
-- Fase 1 langkah 4: Vendor master. Prasyarat sebelum Purchase Order (langkah 7)
-- karena PO butuh referensi vendor.
--
-- `status` dipakai untuk NONAKTIFKAN vendor (soft delete) bukan hapus baris --
-- karena begitu Purchase Order dibangun (langkah 7), PO akan FK ke vendor ini,
-- hard delete akan merusak riwayat PO. DeleteVendor endpoint set status='inactive',
-- bukan DELETE FROM.

CREATE TABLE IF NOT EXISTS vendors (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    npwp TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_account_holder TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendors_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

INSERT INTO permissions (key, description) VALUES
    ('vendors.manage', 'Create, update, deactivate vendor master')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('system_admin', 'procurement_general_manager') AND p.key = 'vendors.manage'
ON CONFLICT DO NOTHING;
