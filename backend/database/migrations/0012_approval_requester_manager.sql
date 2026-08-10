-- 0012_approval_requester_manager.sql
-- Fase 1 lanjutan: approval matrix REAL disepakati user 2026-07-15 --
--   "Manager (atasan langsung pemohon) approve, SELESAI (1 step)" untuk semua
--   departemen KECUALI Product & Development dan Operations yang harus lanjut
--   ke GM (2 step: Manager dulu, baru GM).
--
-- Approver "Manager" di sini BUKAN role tetap (karena tiap sub-tim Operations/
-- Sales dsb punya Manager sendiri-sendiri) -- melainkan DINAMIS: siapa pun yang
-- ada di users.manager_id milik requester. approval_matrices.approver_type
-- membedakan step 'role' (approver_role_id, dipakai utk GM -- cuma 1 per
-- departemen jadi aman sbg role tetap) vs 'requester_manager' (resolve manager_id
-- requester saat SubmitForApproval dipanggil).
--
-- manager_id semua user MASIH NULL (belum diisi, menyusul via CRUD). Supaya
-- tidak memblokir alur sekarang: kalau requester belum punya manager_id, step
-- 'requester_manager' OTOMATIS berstatus 'skipped' (bukan error/pending selamanya)
-- -- begitu manager_id diisi belakangan, submission BERIKUTNYA otomatis kena gate
-- sesungguhnya tanpa perlu ubah kode.

ALTER TABLE approval_matrices ADD COLUMN IF NOT EXISTS approver_type TEXT NOT NULL DEFAULT 'role';
ALTER TABLE approval_matrices ALTER COLUMN approver_role_id DROP NOT NULL;
ALTER TABLE approval_matrices ADD CONSTRAINT approval_matrices_approver_type_check
    CHECK (approver_type IN ('role', 'requester_manager'));
ALTER TABLE approval_matrices ADD CONSTRAINT approval_matrices_approver_consistency_check
    CHECK (
        (approver_type = 'role' AND approver_role_id IS NOT NULL)
        OR (approver_type = 'requester_manager' AND approver_role_id IS NULL)
    );

ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS approver_user_id BIGINT REFERENCES users(id);
ALTER TABLE approval_steps ALTER COLUMN approver_role_id DROP NOT NULL;
ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_approver_consistency_check
    CHECK (
        approver_role_id IS NOT NULL OR approver_user_id IS NOT NULL OR status = 'skipped'
    );

-- Hapus matrix contoh/placeholder test_entity dari langkah 3 (sudah tidak
-- relevan, cuma dipakai buat verifikasi mekanisme waktu itu).
DELETE FROM approval_matrices WHERE entity_type = 'test_entity';

-- ===== Matrix REAL =====

-- purchase_request (Operations): Manager (dinamis) -> GM (role tetap, 2 step)
INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
SELECT 'purchase_request', d.id, 0, NULL, 1, 'requester_manager', NULL
FROM departments d WHERE d.key = 'operations';

INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
SELECT 'purchase_request', d.id, 0, NULL, 2, 'role', r.id
FROM departments d JOIN roles r ON r.key = 'operations_gm'
WHERE d.key = 'operations';

-- purchase_order (Procurement): Manager (dinamis) saja, Procurement tidak ada GM
INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
SELECT 'purchase_order', d.id, 0, NULL, 1, 'requester_manager', NULL
FROM departments d WHERE d.key = 'procurement';

-- presales_price_approval: diatribusikan ke Finance (Finance yang finalisasi
-- rekomendasi harga, lihat recomputeOverallStatus di presales.go) -- Manager
-- (dinamis) saja, Finance tidak ada GM.
INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
SELECT 'presales_price_approval', d.id, 0, NULL, 1, 'requester_manager', NULL
FROM departments d WHERE d.key = 'finance';
