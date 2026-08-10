ALTER TABLE users ADD COLUMN hourly_rate NUMERIC(18,2);

CREATE TABLE timesheets (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    work_date DATE NOT NULL,
    hours NUMERIC(5,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT timesheets_hours_check CHECK (hours > 0 AND hours <= 24)
);

CREATE INDEX idx_timesheets_project ON timesheets(project_id);
CREATE INDEX idx_timesheets_user_date ON timesheets(user_id, work_date);
