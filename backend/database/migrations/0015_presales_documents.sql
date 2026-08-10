-- 0015_presales_documents.sql
-- Lampiran dokumen per bagian Presales Analysis (ProDev/Operations/Procurement/
-- Finance) -- mis. business plan/P&L dari Finance, timeline pekerjaan dari
-- Operations. Terpisah dari project_documents (RFQ/TOR/Lainnya) karena model
-- otorisasinya beda: upload di sini digate PER DEPARTEMEN (requireDepartment,
-- sama seperti isi status/estimasi bagian yang sama), bukan cuma division.
-- Additive.

CREATE TABLE IF NOT EXISTS presales_documents (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('prodev', 'operations', 'procurement', 'finance')),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presales_documents_project ON presales_documents(project_id);
