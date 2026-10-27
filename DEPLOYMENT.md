# Production Deployment Runbook

## Configuration

Production secrets must exist only in the deployment host environment file or
secret manager. Do not commit `.env` or copy real values into `.env.example`.

Required variables:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `JWT_SECRET` (minimum 32 characters, randomly generated)
- `AUTH_COOKIE_SECURE=true` when the application is served over HTTPS
- `LEADGEN_BACKEND_URL`

## Pre-deployment checks

1. Confirm the target image tags and the Git commit being deployed.
2. Create a fresh PostgreSQL backup.
3. Verify the backup checksum.
4. Confirm that the backup can be restored to an isolated database.
5. Confirm the host environment variables are present.
6. Run `docker compose config --quiet` with the host environment loaded.

## Startup verification

After starting the stack:

```bash
curl -f http://127.0.0.1:8081/health
curl -f http://127.0.0.1:8081/ready
```

`/health` only verifies that the process is alive. `/ready` verifies that the
database is reachable and that the minimum dashboard schema is available.

Do not expose the backend port directly to the public internet unless the
network policy requires it. Prefer routing public traffic through the frontend
or a TLS reverse proxy.

## Rollback

1. Stop the deployment only if the current release is unhealthy or data is at
   risk.
2. Pin backend and frontend images to the previous immutable commit tags.
3. Start the stack again and verify `/health` and `/ready`.
4. Run a read-only dashboard smoke test: login, project list, dashboard,
   pipeline, SPH, budget, and CSV export.
5. Restore the database only when a schema/data change has already affected
   production and the restore decision has been explicitly approved.

Never use `latest` as the rollback target. Keep the previous image tags and
the corresponding Git commit recorded for every release.

## Post-deployment checks

- Confirm login and logout.
- Confirm read-only accounts cannot write.
- Confirm a normal user sees only the permitted division.
- Confirm dashboard totals and SPH variance against the pre-deployment
  baseline.
- Confirm application logs contain no password, JWT, or database secret.
