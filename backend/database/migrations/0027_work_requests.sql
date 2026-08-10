CREATE TABLE work_requests (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('poc', 'demo', 'internal')),
    title TEXT NOT NULL,
    description TEXT,
    customer_id BIGINT REFERENCES customers(id),
    requesting_department_id BIGINT REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
    target_date DATE,
    notes TEXT,
    requested_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT work_requests_customer_check CHECK (
        (type IN ('poc','demo') AND customer_id IS NOT NULL AND requesting_department_id IS NULL) OR
        (type = 'internal' AND requesting_department_id IS NOT NULL AND customer_id IS NULL)
    )
);

CREATE INDEX idx_work_requests_type ON work_requests(type);
CREATE INDEX idx_work_requests_status ON work_requests(status);
