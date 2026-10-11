-- Bersihkan nilai SPH yang tertinggal di project dengan SPH Release = No.
-- Dulu edit project mempertahankan sph_revenue lama (COALESCE) saat SPH Release
-- diubah dari Yes ke No, sehingga project "No" masih punya SPH Value.
-- Aman dijalankan berulang.

-- 1) Cek dulu project yang terdampak
SELECT p.project_code, p.sph_release_status,
       COUNT(*) AS bulan_dengan_sph,
       SUM(rp.sph_revenue) AS total_sph_tertinggal
FROM projects p
JOIN project_revenue_plan rp ON rp.project_id = p.id
WHERE COALESCE(p.sph_release_status, 'No') <> 'Yes'
  AND rp.sph_revenue IS NOT NULL
GROUP BY p.project_code, p.sph_release_status
ORDER BY p.project_code;

-- 2) Kosongkan (NULL, bukan 0)
BEGIN;

UPDATE project_revenue_plan rp
SET sph_revenue = NULL
FROM projects p
WHERE p.id = rp.project_id
  AND COALESCE(p.sph_release_status, 'No') <> 'Yes'
  AND rp.sph_revenue IS NOT NULL;

COMMIT;
