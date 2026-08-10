ALTER TABLE project_documents DROP CONSTRAINT project_documents_category_check;
ALTER TABLE project_documents ADD CONSTRAINT project_documents_category_check
    CHECK (category IN ('RFQ', 'TOR', 'SPH', 'PO', 'Kontrak', 'BAST', 'Lainnya'));

ALTER TABLE project_documents ADD COLUMN expiry_date DATE;

CREATE INDEX idx_project_documents_expiry ON project_documents(expiry_date) WHERE expiry_date IS NOT NULL;
