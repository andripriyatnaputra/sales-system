#!/usr/bin/env bash
# ops/test_restore_backup.sh
#
# Fase 0 poin 4: "Uji restore berkala" -- backup yang tidak pernah dicoba
# di-restore bukan backup yang bisa diandalkan. Script ini restore file
# backup (hasil ops/backup_production_db.sh) ke CONTAINER POSTGRES SEKALI
# PAKAI (bukan staging, bukan produksi -- sepenuhnya terisolasi), jalankan
# sanity check dasar, lalu buang container-nya. Aman dijalankan kapan saja,
# TIDAK menyentuh database produksi atau staging manapun.
#
# Pakai: ./ops/test_restore_backup.sh /path/ke/salesdb_20260721_020000.sql.gz

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Pakai: $0 <path-ke-file-backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: file backup tidak ditemukan: $BACKUP_FILE" >&2
  exit 1
fi

CONTAINER_NAME="salesdb-restore-test-$$"
TEST_PORT="${TEST_RESTORE_PORT:-55432}"

cleanup() {
  echo "[$(date -Iseconds)] Membersihkan container test $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[$(date -Iseconds)] Menyalakan container Postgres sekali-pakai ($CONTAINER_NAME) di port $TEST_PORT"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=sales -e POSTGRES_PASSWORD=restore_test_only -e POSTGRES_DB=salesdb \
  -p "${TEST_PORT}:5432" \
  postgres:15 >/dev/null

echo "[$(date -Iseconds)] Menunggu Postgres siap..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U sales >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres test container tidak siap setelah 30 detik" >&2
    exit 1
  fi
done

echo "[$(date -Iseconds)] Restore $BACKUP_FILE ..."
restore_log="/tmp/restore_test_$$.log"
if ! gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U sales -d salesdb -v ON_ERROR_STOP=1 >"$restore_log" 2>&1; then
  echo "ERROR: restore GAGAL, lihat $restore_log" >&2
  tail -30 "$restore_log" >&2
  exit 1
fi
echo "[$(date -Iseconds)] Restore selesai tanpa error SQL"

echo "[$(date -Iseconds)] Sanity check row count..."
for table in users customers projects; do
  count=$(docker exec "$CONTAINER_NAME" psql -U sales -d salesdb -t -c "SELECT count(*) FROM $table;" 2>/dev/null | tr -d '[:space:]')
  echo "  - $table: $count baris"
  if [ -z "$count" ] || [ "$count" = "0" ]; then
    echo "PERINGATAN: tabel $table kosong/tidak terbaca -- restore mungkin tidak lengkap, cek manual." >&2
  fi
done

echo "[$(date -Iseconds)] Restore test SELESAI untuk $BACKUP_FILE -- lihat hasil sanity check di atas."
