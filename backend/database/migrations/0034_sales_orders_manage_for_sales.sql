-- sales_orders.manage permission SEBELUMNYA cuma dipegang system_admin --
-- ditemukan saat verifikasi Susulan "SO total_value dari Customer PO":
-- ROUTE customer-pos (POST/PUT/DELETE) sudah digate middleware.RequirePermission
-- ("sales_orders.manage") di routes.go, TAPI tidak ada role Sales manapun
-- (staff/manager, 3 sub-tim) yang pernah diberi permission ini -- artinya
-- endpoint customer PO SELAMA INI tidak pernah bisa dipakai Sales sungguhan,
-- cuma system_admin. Sekarang jadi krusial krn sales_orders.total_value
-- (nilai deal yang ditampilkan di mana-mana) langsung disinkron dari data ini.
--
-- Diberikan ke SEMUA role Sales (staff+manager, 3 sub-tim) -- bukan cuma
-- manager -- konsisten dgn requireDepartment(c,"Sales") di handler
-- (department-level, bukan level-restricted).

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN org_units ou ON ou.id = r.org_unit_id
JOIN departments d ON d.id = ou.department_id
CROSS JOIN permissions p
WHERE d.key = 'sales' AND p.key = 'sales_orders.manage'
ON CONFLICT DO NOTHING;
