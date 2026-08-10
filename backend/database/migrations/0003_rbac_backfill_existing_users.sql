-- 0003_rbac_backfill_existing_users.sql (REVISI 2026-07-15 -- 9 user riil dari dump segar)
-- Mapping dikonfirmasi user 2026-07-15:
--   admin, msn      -> System Admin (IT) -- role admin lama, division "Admin"
--   andriputra      -> Sales IT Solutions - Manager (dikonfirmasi "Sales Manager")
--   sigit           -> Sales Network and Communications - Manager (dikonfirmasi "Sales Manager")
--   intan           -> Sales Network and Communications - Staff (dikonfirmasi 2026-07-15)
--   rikki           -> Sales Oil Mining and Governments - Manager (dikonfirmasi 2026-07-15)
--   rian, riezka    -> Sales Oil Mining and Governments - Staff (dikonfirmasi 2026-07-15)
--   wibi            -> Sales IT Solutions - Staff (dikonfirmasi 2026-07-15)
-- manager_id semua masih NULL (struktur atasan-bawahan riil belum ada datanya).
-- division (vertikal proyek) lama TIDAK DIUBAH, dibiarkan seperti sekarang.

UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'system_admin') WHERE username IN ('admin', 'msn');
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_it_solutions_manager') WHERE username = 'andriputra';
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_netco_manager') WHERE username = 'sigit';
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_netco_staff') WHERE username = 'intan';
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_oil_mining_manager') WHERE username = 'rikki';
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_oil_mining_staff') WHERE username IN ('rian', 'riezka');
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'sales_it_solutions_staff') WHERE username = 'wibi';
