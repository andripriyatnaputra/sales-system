-- 0013_project_documents.sql
-- Dokumen project (RFQ/TOR/dll) menempel ke project sepanjang siklus hidupnya --
-- bukan cuma diisi sekali saat create project. Siapa pun yang bisa lihat project
-- itu (division-scoped sama seperti endpoint project lain) bisa upload/lihat.
-- File disimpan di disk lokal (UPLOAD_DIR, default ./uploads), path relatif
-- disimpan di file_path -- BELUM masuk skema backup rutin, perlu ditambahkan
-- sebelum ke produksi (lihat Fase 0).

CREATE TABLE IF NOT EXISTS project_documents (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'Lainnya',
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_documents_category_check CHECK (category IN ('RFQ', 'TOR', 'Lainnya'))
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
