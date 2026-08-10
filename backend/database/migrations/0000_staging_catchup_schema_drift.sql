-- 0000_staging_catchup_schema_drift.sql
-- BUKAN bagian Fase 1/RBAC. Ini tambalan supaya staging (hasil restore backup.sql
-- Jan 2026 yang basi) sejajar dengan kolom yang sudah dipakai kode main branch
-- saat ini (pipeline_status, sph_status_reason_category/note di projects).
--
-- Ditemukan 2026-07-15 saat verifikasi RBAC: GET /api/projects gagal di staging
-- karena kolom pipeline_status belum ada -- bukti nyata backup.sql sudah
-- ketinggalan dari skema produksi asli. Migrasi ini HARUS divalidasi ulang
-- terhadap skema produksi sebelum dipakai di luar staging (nomor/nilai default
-- di sini cuma tebakan berbasis kode Go, bukan hasil introspeksi DB produksi).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sph_status_reason_category TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sph_status_reason_note TEXT;

ALTER TABLE project_revenue_plan ADD COLUMN IF NOT EXISTS sph_revenue NUMERIC(18,2);
