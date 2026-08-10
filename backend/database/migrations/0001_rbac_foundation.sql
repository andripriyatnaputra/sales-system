-- 0001_rbac_foundation.sql (REVISI 2026-07-15 -- struktur org sebenarnya)
-- Fase 1 langkah 1: fondasi RBAC (departemen -> sub-tim/org_unit -> level, permission,
-- struktur atasan). Revisi dari draft awal karena struktur organisasi riil ternyata
-- berjenjang (departemen punya sub-tim), bukan flat departemen+level.
--
-- ADDITIVE terhadap users: tidak mengubah/menghapus users.role atau users.division
-- yang sudah ada, supaya pengecekan role=="admin"/role=="user" di handlers existing
-- tetap jalan tanpa regresi selama masa transisi.
--
-- CATATAN PENTING: `division` di users/projects (NetCo, Oil Gas & Mining, IT Solutions)
-- = lini bisnis/vertikal proyek -- TIDAK SAMA dengan struktur organisasi di bawah ini.
-- Kebetulan untuk departemen Sales, nama org_unit-nya sama persis dengan nilai divisi
-- (karena satu tim Sales memang menjual ke satu vertikal), tapi untuk departemen lain
-- (ProDev, Operations, dst) org_unit adalah sub-tim fungsional, tidak ada hubungan
-- dengan kolom division sama sekali.

CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    has_gm BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_units (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_units_department_id ON org_units(department_id);

-- roles: staff/manager menempel ke org_unit (sub-tim spesifik), gm menempel ke
-- department langsung (membawahi semua manager sub-tim di departemen itu),
-- executive/system_admin lintas-departemen (tidak menempel ke unit mana pun).
CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    org_unit_id BIGINT REFERENCES org_units(id),
    department_id BIGINT REFERENCES departments(id),
    level TEXT NOT NULL,
    legacy_role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roles_level_check CHECK (
        level = ANY (ARRAY['staff', 'manager', 'gm', 'executive', 'system_admin'])
    ),
    CONSTRAINT roles_legacy_role_check CHECK (legacy_role = ANY (ARRAY['admin', 'user'])),
    CONSTRAINT roles_staff_manager_need_org_unit CHECK (
        (level IN ('staff', 'manager') AND org_unit_id IS NOT NULL AND department_id IS NULL)
        OR level NOT IN ('staff', 'manager')
    ),
    CONSTRAINT roles_gm_needs_department CHECK (
        (level = 'gm' AND department_id IS NOT NULL AND org_unit_id IS NULL)
        OR level != 'gm'
    ),
    CONSTRAINT roles_crosscutting_no_unit CHECK (
        (level IN ('executive', 'system_admin') AND org_unit_id IS NULL AND department_id IS NULL)
        OR level NOT IN ('executive', 'system_admin')
    )
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id BIGINT REFERENCES roles(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
