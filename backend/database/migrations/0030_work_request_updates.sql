CREATE TABLE work_request_updates (
    id BIGSERIAL PRIMARY KEY,
    work_request_id BIGINT NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_request_updates_wr ON work_request_updates(work_request_id);
