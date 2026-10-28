#!/usr/bin/env bash
# Backup the staging upload volume (project documents, presales documents,
# work-request attachments, and payment proofs) with local retention tiers.
# Run on the staging server, not from the development workstation.

set -euo pipefail
umask 077

UPLOAD_VOLUME="${STAGING_UPLOAD_VOLUME:-sales-staging_uploads_staging}"
BACKUP_DIR="${STAGING_UPLOAD_BACKUP_DIR:-/var/backups/sales-staging-uploads}"
RETAIN_DAILY="${STAGING_UPLOAD_RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${STAGING_UPLOAD_RETAIN_WEEKLY:-5}"
RETAIN_MONTHLY="${STAGING_UPLOAD_RETAIN_MONTHLY:-12}"

case "$BACKUP_DIR" in
  /*) ;;
  *) echo "ERROR: STAGING_UPLOAD_BACKUP_DIR harus berupa path absolut" >&2; exit 1 ;;
esac

if ! docker volume inspect "$UPLOAD_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: volume upload tidak ditemukan: $UPLOAD_VOLUME" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d_%H%M%S)"
day_of_week="$(date +%u)"
day_of_month="$(date +%d)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

archive_name="uploads_${timestamp}.tar.gz"
archive_path="$BACKUP_DIR/daily/$archive_name"

echo "[$(date -Iseconds)] Mulai backup volume $UPLOAD_VOLUME ke $archive_path"
# Read the volume as root inside the disposable container because application
# uploads may be owned by root with restrictive permissions. The archive bytes
# are streamed to the host, so the host-side umask and chmod keep the archive
# private to the backup user.
docker run --rm \
  --mount "type=volume,src=$UPLOAD_VOLUME,dst=/source,readonly" \
  alpine:3.18 \
  sh -c "tar -czf - -C /source ." > "$archive_path"

# The archive is created inside Alpine, whose default umask may be 022.
# Enforce private permissions from the host-side script as well.
chmod 600 "$archive_path"

if [[ ! -s "$archive_path" ]]; then
  echo "ERROR: archive upload kosong/gagal ditulis: $archive_path" >&2
  exit 1
fi
sha256sum "$archive_path" > "$archive_path.sha256"
echo "[$(date -Iseconds)] Backup upload sukses: $archive_path ($(du -h "$archive_path" | cut -f1))"

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
  mapfile -t archives < <(find "$dir" -maxdepth 1 -type f -name 'uploads_*.tar.gz' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
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
