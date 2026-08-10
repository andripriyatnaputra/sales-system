-- 0017_payment_proof.sql
-- Fase 2 langkah 2: bukti pembayaran (proof) untuk termin vendor (payment_schedules).
-- Kolom langsung di payment_schedules, BUKAN tabel baru -- satu termin
-- realistisnya cuma butuh satu bukti transfer, beda dari project_documents/
-- presales_documents yang memang butuh banyak dokumen per entity.
-- Additive.

ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS proof_file_name TEXT;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS proof_file_path TEXT;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS proof_file_size BIGINT;
