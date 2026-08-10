-- Manager approval untuk submission bagian ProDev di Presales Analysis --
-- staff ProDev submit BoQ/solusi (UpdateProdevSection), harus disetujui
-- manager langsungnya (approver_type='requester_manager', resolve dari
-- users.manager_id si requester) dulu sebelum status jadi 'submitted' dan
-- ikut dihitung ke overall_status. Kalau requester tidak punya manager_id,
-- SubmitForApproval auto-skip step ini (approved langsung) -- perilaku
-- existing, bukan baru.
--
-- Scope SENGAJA cuma bagian ProDev (boq_status) -- bukan Operations/
-- Procurement/Finance juga -- sesuai kasus konkret yang dilaporkan user
-- (staff ProDev update dokumen tanpa approval manajer). Kalau nanti mau
-- diperluas ke 3 bagian lain, cukup tambah baris approval_matrices serupa
-- + kolom *_approval_request_id lain, pola yang sama persis.

ALTER TABLE presales_analyses
  ADD COLUMN IF NOT EXISTS boq_approval_request_id BIGINT REFERENCES approval_requests(id);

ALTER TABLE presales_analyses DROP CONSTRAINT IF EXISTS presales_boq_status_check;
ALTER TABLE presales_analyses ADD CONSTRAINT presales_boq_status_check
  CHECK (boq_status = ANY (ARRAY['pending'::text, 'pending_approval'::text, 'submitted'::text]));

INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
SELECT 'presales_prodev_submission', d.id, 0, NULL, 1, 'requester_manager', NULL
FROM departments d WHERE d.key = 'product_development'
ON CONFLICT DO NOTHING;
