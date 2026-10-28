#!/usr/bin/env bash
# Run the staging database and upload backups as one scheduled operation.
# Database is backed up first so the two artifacts form a clear recovery pair.

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "$0")" && pwd)"
lock_file="${STAGING_BACKUP_LOCK_FILE:-/tmp/sales-staging-backup.lock}"
db_backup_dir="${STAGING_DB_BACKUP_DIR:-/var/backups/sales-staging-db}"
upload_backup_dir="${STAGING_UPLOAD_BACKUP_DIR:-/var/backups/sales-staging-uploads}"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Backup staging lain masih berjalan; keluar tanpa menjalankan backup kedua." >&2
  exit 1
fi

echo "[$(date -Iseconds)] Menjalankan backup database staging"
STAGING_DB_BACKUP_DIR="$db_backup_dir" "$script_dir/backup_staging_db.sh"

echo "[$(date -Iseconds)] Menjalankan backup upload staging"
STAGING_UPLOAD_BACKUP_DIR="$upload_backup_dir" "$script_dir/backup_staging_uploads.sh"

echo "[$(date -Iseconds)] Backup database dan upload staging selesai"
