-- Track migrations applied by the staging deployment.
-- The deployment wrapper owns ordering, checksums, and the advisory lock;
-- this migration only creates the registry table and is safe to rerun.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
