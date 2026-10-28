#!/usr/bin/env bash
# Backup the staging PostgreSQL database from the staging Postgres container.
# Run on the staging server, not from the development workstation.

set -euo pipefail
umask 077

COMPOSE_FILE="${STAGING_COMPOSE_FILE:-docker-compose.staging-server.yml}"
COMPOSE_PROJECT="${STAGING_COMPOSE_PROJECT:-sales-staging}"
DB_USER="${STAGING_DB_USER:-sales_staging}"
DB_NAME="${STAGING_DB_NAME:-salesdb_staging}"
BACKUP_DIR="${STAGING_DB_BACKUP_DIR:-/var/backups/sales-staging-db}"
RETAIN_DAILY="${STAGING_DB_RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${STAGING_DB_RETAIN_WEEKLY:-5}"
RETAIN_MONTHLY="${STAGING_DB_RETAIN_MONTHLY:-12}"

case "$BACKUP_DIR" in
  /*) ;;
  *) echo "ERROR: STAGING_DB_BACKUP_DIR harus berupa path absolut" >&2; exit 1 ;;
esac

compose=(docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT")
postgres_id="$("${compose[@]}" ps -q postgres 2>/dev/null || true)"
if [[ -z "$postgres_id" ]]; then
  echo "ERROR: container postgres staging tidak ditemukan" >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$postgres_id" | grep -qx true; then
  echo "ERROR: container postgres staging tidak sedang running" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d_%H%M%S)"
day_of_week="$(date +%u)"
day_of_month="$(date +%d)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

archive_name="salesdb_staging_${timestamp}.sql.gz"
archive_path="$BACKUP_DIR/daily/$archive_name"

echo "[$(date -Iseconds)] Mulai backup database $DB_NAME ke $archive_path"
"${compose[@]}" exec -T postgres pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  | gzip > "$archive_path"

if [[ ! -s "$archive_path" ]]; then
  echo "ERROR: archive database kosong/gagal ditulis: $archive_path" >&2
  exit 1
fi
sha256sum "$archive_path" > "$archive_path.sha256"
echo "[$(date -Iseconds)] Backup database sukses: $archive_path ($(du -h "$archive_path" | cut -f1))"

if [[ "$day_of_week" = "7" ]]; then
  cp "$archive_path" "$BACKUP_DIR/weekly/"
  cp "$archive_path.sha256" "$BACKUP_DIR/weekly/"
fi
if [[ "$day_of_month" = "01" ]]; then
  cp "$archive_path" "$BACKUP_DIR/monthly/"
  cp "$archive_path.sha256" "$BACKUP_DIR/monthly/"
fi

prune() {
  local dir="$1" keep="$2"
  mapfile -t archives < <(find "$dir" -maxdepth 1 -type f -name 'salesdb_staging_*.sql.gz' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  if (( ${#archives[@]} > keep )); then
    for archive in "${archives[@]:keep}"; do
      rm -f -- "$archive" "$archive.sha256"
    done
  fi
}

prune "$BACKUP_DIR/daily" "$RETAIN_DAILY"
prune "$BACKUP_DIR/weekly" "$RETAIN_WEEKLY"
prune "$BACKUP_DIR/monthly" "$RETAIN_MONTHLY"
echo "[$(date -Iseconds)] Rotasi selesai (daily=$RETAIN_DAILY weekly=$RETAIN_WEEKLY monthly=$RETAIN_MONTHLY)"
