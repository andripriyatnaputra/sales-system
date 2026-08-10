CREATE TABLE work_request_attachments (
    id BIGSERIAL PRIMARY KEY,
    work_request_id BIGINT NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_request_attachments_wr ON work_request_attachments(work_request_id);
