#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-}"
if [[ -z "$base_url" ]]; then
  echo "usage: $0 <base-url>" >&2
  exit 2
fi

base_url="${base_url%/}"
curl --fail --silent --show-error "$base_url/health" >/dev/null
curl --fail --silent --show-error "$base_url/ready" >/dev/null
echo "smoke check passed: $base_url"
