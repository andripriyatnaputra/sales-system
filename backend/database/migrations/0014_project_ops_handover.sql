-- 0014_project_ops_handover.sql
-- Project Recurring/New Recurring: begitu BAST Customer dibuat (instalasi/
-- delivery selesai), tanggung jawab operasional berpindah dari Ops
-- Implementations ke Ops Managed Service (searah, otomatis, idempoten --
-- lihat handlers/bast_customer.go maybeHandoverToManagedService). Project
-- Based tidak pernah berpindah, tetap Implementations selamanya.
-- Additive.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS ops_team TEXT NOT NULL DEFAULT 'Implementations'
    CHECK (ops_team IN ('Implementations', 'Managed Service'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ops_handover_date TIMESTAMPTZ;
