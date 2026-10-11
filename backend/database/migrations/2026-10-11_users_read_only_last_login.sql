-- Kolom users yang dibutuhkan backend main (cb40117 + fix last_login).
-- Aman dijalankan berulang (IF NOT EXISTS).

BEGIN;

-- read_only: akun read-only untuk share dashboard (commit cb40117)
ALTER TABLE users ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;

-- last_login: diisi otomatis saat login berhasil
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

COMMIT;
