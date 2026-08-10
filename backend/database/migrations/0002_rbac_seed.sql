-- 0002_rbac_seed.sql (REVISI 2026-07-15 -- struktur org sebenarnya)
-- Seed departments, org_units, roles, permissions sesuai struktur organisasi
-- yang dikonfirmasi user 2026-07-15:
--   1. Sales (IT Solutions, Network and Communications, Oil Mining and Governments)
--   2. Product & Development (Network Solutions, Development) -- ADA GM
--   3. Operations (Implementations, Managed Service) -- ADA GM
--   4. Procurement (tanpa sub-tim)
--   5. Finance (tanpa sub-tim)
--   6. HR GA & Legal (HR, GA, Legal)
-- Departemen selain #2 dan #3: cuma 2 level (Staff, Manager), tidak ada GM.

INSERT INTO departments (key, name, has_gm) VALUES
    ('sales', 'Sales', false),
    ('product_development', 'Product & Development', true),
    ('operations', 'Operations', true),
    ('procurement', 'Procurement', false),
    ('finance', 'Finance', false),
    ('hr_ga_legal', 'HR GA & Legal', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO org_units (department_id, key, name)
SELECT d.id, v.key, v.name FROM departments d
JOIN (VALUES
    ('sales', 'sales_it_solutions', 'IT Solutions'),
    ('sales', 'sales_netco', 'Network and Communications'),
    ('sales', 'sales_oil_mining', 'Oil Mining and Governments'),
    ('product_development', 'prodev_network_solutions', 'Network Solutions'),
    ('product_development', 'prodev_development', 'Development'),
    ('operations', 'ops_implementations', 'Implementations'),
    ('operations', 'ops_managed_service', 'Managed Service'),
    ('procurement', 'procurement_general', 'Procurement'),
    ('finance', 'finance_general', 'Finance'),
    ('hr_ga_legal', 'hr_ga_legal_hr', 'HR'),
    ('hr_ga_legal', 'hr_ga_legal_ga', 'GA'),
    ('hr_ga_legal', 'hr_ga_legal_legal', 'Legal')
) AS v(dept_key, key, name) ON v.dept_key = d.key
ON CONFLICT (key) DO NOTHING;

-- Role staff & manager per org_unit
INSERT INTO roles (key, label, org_unit_id, level, legacy_role)
SELECT ou.key || '_staff', ou.name || ' - Staff', ou.id, 'staff', 'user' FROM org_units ou
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (key, label, org_unit_id, level, legacy_role)
SELECT ou.key || '_manager', ou.name || ' - Manager', ou.id, 'manager', 'user' FROM org_units ou
ON CONFLICT (key) DO NOTHING;

-- Role GM, cuma untuk departemen dengan has_gm = true
INSERT INTO roles (key, label, department_id, level, legacy_role)
SELECT d.key || '_gm', d.name || ' - GM', d.id, 'gm', 'user' FROM departments d WHERE d.has_gm
ON CONFLICT (key) DO NOTHING;

-- Role lintas-departemen
INSERT INTO roles (key, label, level, legacy_role) VALUES
    ('executive', 'Direksi / Executive', 'executive', 'admin'),
    ('system_admin', 'System Admin (IT)', 'system_admin', 'admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
    ('users.manage', 'Create, update, delete, list users'),
    ('roles.manage', 'Assign/ubah role dan permission user lain')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'system_admin'
ON CONFLICT DO NOTHING;
