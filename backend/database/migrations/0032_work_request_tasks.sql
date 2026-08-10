CREATE TABLE work_request_tasks (
    id BIGSERIAL PRIMARY KEY,
    work_request_id BIGINT NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT false,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_work_request_tasks_wr ON work_request_tasks(work_request_id);
