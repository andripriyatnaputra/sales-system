#!/usr/bin/env bash
# Migrate upload files from the old backend container writable layer into the
# persistent staging volume. Run before recreating backend after adding the
# volume mount. This script is intentionally staging-only.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging-server.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-sales-staging}"
UPLOAD_VOLUME="${UPLOAD_VOLUME:-sales-staging_uploads_staging}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
staging_tmp="/tmp/staging-upload-migration-$$"

compose=(docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT")
mkdir -p "$staging_tmp"

cleanup() {
  rm -rf "$staging_tmp"
}
trap cleanup EXIT

if ! docker volume inspect "$UPLOAD_VOLUME" >/dev/null 2>&1; then
  echo "Creating persistent upload volume: $UPLOAD_VOLUME"
  docker volume create "$UPLOAD_VOLUME" >/dev/null
fi

if docker run --rm -v "$UPLOAD_VOLUME:/existing:ro" alpine:3.18 \
  sh -c 'test -n "$(find /existing -mindepth 1 -print -quit 2>/dev/null)"'; then
  echo "Persistent upload volume already contains files; migration is not needed."
  exit 0
fi

old_backend="$("${compose[@]}" ps -q "$BACKEND_SERVICE" 2>/dev/null || true)"
if [[ -z "$old_backend" ]]; then
  echo "No existing $BACKEND_SERVICE container found; nothing to migrate."
  exit 0
fi

if ! docker cp "$old_backend:/app/uploads/." "$staging_tmp/" >/dev/null 2>&1; then
  echo "No legacy /app/uploads directory found in $old_backend; nothing to migrate."
  exit 0
fi

if [[ -z "$(find "$staging_tmp" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "Legacy upload directory is empty; nothing to migrate."
  exit 0
fi

echo "Copying legacy uploads from $old_backend into $UPLOAD_VOLUME"
docker run --rm \
  -v "$staging_tmp:/source:ro" \
  -v "$UPLOAD_VOLUME:/dest" \
  alpine:3.18 sh -c 'cp -a /source/. /dest/'

echo "Upload migration completed."
