-- 0004_audit_log.sql
-- Fase 1 langkah 2: Audit trail / activity log generik.
-- Additive, tidak menyentuh tabel lain. Dipakai lintas modul (user, project,
-- budget, dan modul-modul berikutnya: approval, PR/PO, dst) lewat satu helper
-- LogAudit() di backend -- bukan diimplementasikan ulang per modul.

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id),
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_label TEXT,
    changes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

INSERT INTO permissions (key, description) VALUES
    ('audit.view', 'Lihat audit trail/activity log seluruh sistem')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'system_admin' AND p.key = 'audit.view'
ON CONFLICT DO NOTHING;
