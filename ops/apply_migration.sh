#!/usr/bin/env bash
set -euo pipefail

migration_file="${1:-}"
if [[ -z "$migration_file" ]]; then
  echo "usage: $0 backend/database/migrations/<migration>.sql" >&2
  exit 2
fi

if [[ -z "${DB_DSN:-}" ]]; then
  echo "DB_DSN is required" >&2
  exit 2
fi

migrations_root="$(cd "$(dirname "$0")/../backend/database/migrations" && pwd)"
resolved_file="$(realpath "$migration_file")"
case "$resolved_file" in
  "$migrations_root"/*.sql) ;;
  *) echo "migration must be inside $migrations_root" >&2; exit 2 ;;
esac

echo "Applying migration: $resolved_file"
psql "$DB_DSN" --set ON_ERROR_STOP=1 --file "$resolved_file"
echo "Migration applied successfully"
