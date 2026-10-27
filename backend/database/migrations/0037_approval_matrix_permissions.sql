-- Approval matrix governance: only System Admin may configure the rules.
-- The migration intentionally does not seed business thresholds.

INSERT INTO permissions (key, description) VALUES
    ('approval.matrix.manage', 'Lihat dan kelola approval matrix')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'system_admin' AND p.key = 'approval.matrix.manage'
ON CONFLICT DO NOTHING;
