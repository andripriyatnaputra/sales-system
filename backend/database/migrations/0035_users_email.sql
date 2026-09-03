-- users.email -- dasar utk integrasi notifikasi email. Nullable (user lama
-- belum tentu punya, diisi belakangan lewat halaman Users), unique index
-- partial (Postgres izinkan banyak NULL, cuma nilai non-NULL yang harus unik).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email) WHERE email IS NOT NULL;
