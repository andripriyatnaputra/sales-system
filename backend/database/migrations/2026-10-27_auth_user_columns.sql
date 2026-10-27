-- Authentication hardening columns used by the active-user and read-only
-- checks. Safe to run against an existing database.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
