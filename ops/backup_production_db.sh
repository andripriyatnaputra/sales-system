#!/usr/bin/env bash
# ops/backup_production_db.sh
#
# Fase 0 (backup & safety protocol) -- pg_dump database produksi + rotasi
# retensi berlapis (harian/mingguan/bulanan), dijalankan via cron di SERVER
# PRODUKSI (bukan dari sandbox dev). Lihat ops/README.md untuk cara pasang
# cron-nya dan checklist Fase 0 lainnya (rotasi password, backup offsite,
# uji restore berkala via ops/test_restore_backup.sh).
#
# Kegagalan (koneksi DB gagal, disk penuh, dst) bikin script exit non-zero --
# penting supaya cron bisa mendeteksi & kirim notifikasi kegagalan (lihat
# catatan MAILTO di README), BUKAN gagal diam-diam.

set -euo pipefail

# --- Konfigurasi (override via env var kalau perlu, default cocok utk setup
# docker-compose.yml di server produksi ini) ---
DB_HOST="${PROD_DB_HOST:-202.50.203.136}"
DB_PORT="${PROD_DB_PORT:-5433}"
DB_NAME="${PROD_DB_NAME:-salesdb}"
DB_USER="${PROD_DB_USER:-sales}"
# PGPASSWORD wajib di-set sebelum panggil script ini (jangan hardcode di sini,
# jangan commit ke git) -- lihat ops/README.md bagian "Setup cron".
BACKUP_DIR="${BACKUP_DIR:-/var/backups/salesdb}"

RETAIN_DAILY=7      # simpan 7 backup harian terakhir
RETAIN_WEEKLY=5      # simpan 5 backup mingguan terakhir (diambil tiap Minggu)
RETAIN_MONTHLY=12    # simpan 12 backup bulanan terakhir (diambil tiap tgl 1)

timestamp="$(date +%Y%m%d_%H%M%S)"
day_of_week="$(date +%u)"   # 1=Senin .. 7=Minggu
day_of_month="$(date +%d)"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "ERROR: PGPASSWORD belum di-set. Lihat ops/README.md bagian Setup cron." >&2
  exit 1
fi

dump_file="$BACKUP_DIR/daily/salesdb_${timestamp}.sql.gz"

echo "[$(date -Iseconds)] Mulai backup ke $dump_file"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges \
  | gzip > "$dump_file"

if [ ! -s "$dump_file" ]; then
  echo "ERROR: file backup kosong/gagal ditulis: $dump_file" >&2
  exit 1
fi
echo "[$(date -Iseconds)] Backup harian sukses: $dump_file ($(du -h "$dump_file" | cut -f1))"

# Salin ke tier mingguan (tiap Minggu, day_of_week=7) dan bulanan (tgl 1)
if [ "$day_of_week" = "7" ]; then
  cp "$dump_file" "$BACKUP_DIR/weekly/"
  echo "[$(date -Iseconds)] Disalin ke tier weekly"
fi
if [ "$day_of_month" = "01" ]; then
  cp "$dump_file" "$BACKUP_DIR/monthly/"
  echo "[$(date -Iseconds)] Disalin ke tier monthly"
fi

# --- Rotasi: hapus yang lebih lama dari retensi tiap tier ---
prune() {
  local dir="$1" keep="$2"
  local count
  count=$(ls -1 "$dir"/salesdb_*.sql.gz 2>/dev/null | wc -l)
  if [ "$count" -gt "$keep" ]; then
    ls -1t "$dir"/salesdb_*.sql.gz | tail -n "+$((keep + 1))" | xargs -r rm -v --
  fi
}
prune "$BACKUP_DIR/daily" "$RETAIN_DAILY"
prune "$BACKUP_DIR/weekly" "$RETAIN_WEEKLY"
prune "$BACKUP_DIR/monthly" "$RETAIN_MONTHLY"

echo "[$(date -Iseconds)] Rotasi retensi selesai (daily=$RETAIN_DAILY weekly=$RETAIN_WEEKLY monthly=$RETAIN_MONTHLY)"

# --- WAJIB DIISI: salin ke lokasi OFFSITE (di luar host/volume DB produksi) ---
# Fase 0 poin 3 secara eksplisit minta backup TIDAK boleh cuma tersimpan di
# host yang sama dengan DB produksi -- kalau host itu rusak/kena ransomware,
# backup lokal saja tidak menolong. Contoh (pilih salah satu, sesuaikan):
#
#   rsync -az "$dump_file" backup-user@backup-host:/backups/salesdb/
#   aws s3 cp "$dump_file" s3://nama-bucket-backup/salesdb/
#   rclone copy "$dump_file" remote:salesdb-backups/
#
# BELUM diaktifkan di sini karena destinasi offsite belum ditentukan --
# lihat ops/README.md bagian "Backup offsite" utk keputusan yang perlu diambil.
