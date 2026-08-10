CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approval_step_id BIGINT NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'approval_pending',
    title TEXT NOT NULL,
    detail TEXT,
    link TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
