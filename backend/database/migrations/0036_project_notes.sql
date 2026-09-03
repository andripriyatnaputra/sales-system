-- project_notes -- riwayat catatan/penjelasan bebas terkait request/project,
-- TERPISAH dari projects.description (nama/judul singkat project, dipakai di
-- banyak tempat: list, dropdown, dst -- sengaja tidak diubah). Biasa diisi
-- Sales, ditampilkan di halaman detail project berdampingan dgn dokumen
-- project (ProjectDocumentsCard). Bentuk PERSIS work_request_updates
-- (0030_work_request_updates.sql): log append-only, create+delete saja,
-- TIDAK ada update-in-place -- supaya catatan lama tidak hilang saat ada
-- tambahan baru.
--
-- ALTER TABLE projects DROP COLUMN notes membatalkan pendekatan single-field
-- sebelumnya (migrasi ini belum pernah dipakai di production, aman diganti
-- total sebelum commit pertama).

ALTER TABLE projects DROP COLUMN IF EXISTS notes;

CREATE TABLE project_notes (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_notes_project ON project_notes(project_id);
