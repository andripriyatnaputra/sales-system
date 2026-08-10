ALTER TABLE project_documents ADD COLUMN supersedes_id BIGINT REFERENCES project_documents(id);
ALTER TABLE project_documents ADD COLUMN is_latest BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE presales_documents ADD COLUMN supersedes_id BIGINT REFERENCES presales_documents(id);
ALTER TABLE presales_documents ADD COLUMN is_latest BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE boq_items ADD COLUMN source_document_id BIGINT REFERENCES presales_documents(id);

CREATE TABLE boq_item_history (
    id BIGSERIAL PRIMARY KEY,
    boq_item_id BIGINT NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    unit TEXT,
    qty NUMERIC(18,2),
    estimated_vendor_cost NUMERIC(18,2),
    estimated_install_cost NUMERIC(18,2),
    proposed_sell_price NUMERIC(18,2),
    source_document_id BIGINT REFERENCES presales_documents(id),
    changed_by BIGINT NOT NULL REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boq_item_history_item ON boq_item_history(boq_item_id);
