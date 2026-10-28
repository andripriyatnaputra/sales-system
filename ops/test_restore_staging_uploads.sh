#!/usr/bin/env bash
# Validate an upload archive by restoring it into a disposable Docker volume.
# This never modifies the staging upload volume.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Pakai: $0 <path-ke-uploads_*.tar.gz>" >&2
  exit 1
fi

archive="$(realpath "$1")"
if [[ ! -f "$archive" ]]; then
  echo "ERROR: archive tidak ditemukan: $archive" >&2
  exit 1
fi

archive_dir="$(dirname "$archive")"
archive_name="$(basename "$archive")"
restore_volume="sales-staging-upload-restore-test-$$"

cleanup() {
  docker volume rm "$restore_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$restore_volume" >/dev/null
docker run --rm \
  --mount "type=bind,src=$archive_dir,dst=/backup,readonly" \
  --mount "type=volume,src=$restore_volume,dst=/restore" \
  alpine:3.18 \
  sh -c "tar -xzf /backup/$archive_name -C /restore"

file_count="$(docker run --rm -v "$restore_volume:/restore:ro" alpine:3.18 sh -c 'find /restore -type f | wc -l')"
echo "Restore test berhasil: $file_count file dipulihkan ke volume disposable."
