-- 0019_activity_aging_timestamps.sql
-- Aging per kegiatan per departemen. Additive, semua kolom nullable tanpa
-- default -- diisi lewat CASE WHEN inline saat status transisi TERJADI lewat
-- kode (pola sama seperti invoices.sent_at/paid_at), BUKAN di-backfill
-- retroaktif. Baris yang statusnya sudah 'submitted'/'approved' SEBELUM
-- migrasi ini jalan akan punya kolom ini tetap NULL selamanya -- diterima
-- sebagai keterbatasan data lama, bukan bug.

ALTER TABLE presales_analyses
    ADD COLUMN boq_submitted_at TIMESTAMPTZ,
    ADD COLUMN installation_cost_submitted_at TIMESTAMPTZ,
    ADD COLUMN vendor_cost_submitted_at TIMESTAMPTZ,
    ADD COLUMN pnl_submitted_at TIMESTAMPTZ;

ALTER TABLE purchase_requests ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE billing_requests ADD COLUMN approved_at TIMESTAMPTZ;
