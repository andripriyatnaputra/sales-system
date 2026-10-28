#!/usr/bin/env bash
# Validate a staging database archive in an isolated disposable PostgreSQL
# container. This never modifies the staging database.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Pakai: $0 <path-ke-salesdb_staging_*.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$(realpath "$1")"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: archive tidak ditemukan: $BACKUP_FILE" >&2
  exit 1
fi

CONTAINER_NAME="sales-staging-db-restore-test-$$"
DB_USER="sales_staging"
DB_NAME="salesdb_staging"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD=restore_test_only \
  -e POSTGRES_DB="$DB_NAME" \
  postgres:15 >/dev/null

echo "[$(date -Iseconds)] Menunggu PostgreSQL restore test siap..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "ERROR: PostgreSQL restore test tidak siap setelah 30 detik" >&2
    exit 1
  fi
done

restore_log="/tmp/staging_db_restore_test_$$.log"
echo "[$(date -Iseconds)] Restore $BACKUP_FILE ..."
if ! gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql \
  -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 > "$restore_log" 2>&1; then
  echo "ERROR: restore database staging GAGAL, lihat $restore_log" >&2
  tail -30 "$restore_log" >&2
  exit 1
fi
echo "[$(date -Iseconds)] Restore database selesai tanpa error SQL"

for table in users customers projects; do
  count="$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t \
    -c "SELECT count(*) FROM $table;" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ -n "$count" ]]; then
    echo "  - $table: $count baris"
  else
    echo "  - $table: tidak terbaca (cek manual)" >&2
  fi
done

echo "[$(date -Iseconds)] Restore test database staging SELESAI."
