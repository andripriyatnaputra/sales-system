# Fase 0 — Backup & Safety Protocol

Runbook ini untuk dijalankan MANUAL oleh siapa pun yang punya akses SSH ke
server produksi (`202.50.203.136`) — bukan dari sandbox development. Semua
script di folder ini murni file, tidak ada yang otomatis tereksekusi.

## Temuan penting sebelum mulai

**Password produksi lama sudah ter-commit di git** (`backend/.env`, sudah
lama di-track — nilai persisnya SENGAJA tidak ditulis ulang di sini supaya
dokumen ini sendiri tidak jadi sumber kebocoran baru saat commit; cek
langsung isi `backend/.env` di riwayat git kalau perlu tahu nilainya). Ini
bukan cuma soal rotasi password — passwordnya sendiri sudah ada di riwayat
commit repo GitHub. Rotasi password akan menonaktifkan password LAMA yang
sudah bocor itu (langkah paling penting), tapi riwayat git-nya sendiri tidak
otomatis "bersih" kecuali history di-rewrite (operasi berisiko, butuh
koordinasi tim kalau repo di-share/di-fork orang lain — TIDAK dilakukan di
sini, di luar scope runbook ini).

Langkah minimal yang WAJIB, terpisah dari rotasi password:
```bash
git rm --cached backend/.env
git commit -m "stop tracking backend/.env (local dev only, contains stale password)"
```
(File `backend/.env` tetap ada di disk lokal Anda, cuma berhenti di-track ke
depannya — sudah ditambahkan ke `.gitignore` root.)

## Checklist Fase 0

- [ ] 1. Backup manual sekali sekarang (lihat "Jalankan manual" di bawah)
- [ ] 2. Pasang cron harian (lihat "Setup cron")
- [ ] 3. Tentukan & aktifkan backup offsite (lihat "Backup offsite")
- [ ] 4. Uji restore SEKARANG dengan `ops/test_restore_backup.sh` + jadwalkan berkala
- [ ] 5. Rotasi password DB produksi (lihat "Rotasi password")
- [ ] 6. `git rm --cached backend/.env` (lihat di atas)

## Jalankan manual (sekali, untuk tes)

Di server produksi:
```bash
export PGPASSWORD='<password produksi saat ini>'
export BACKUP_DIR=/var/backups/salesdb
./ops/backup_production_db.sh
```
Cek `$BACKUP_DIR/daily/` berisi file `salesdb_<timestamp>.sql.gz`.

## Setup cron

Di server produksi (`crontab -e` sebagai user yang punya izin baca `pg_dump`
ke host DB):
```cron
MAILTO=you@example.com
0 2 * * * PGPASSWORD='<password produksi>' BACKUP_DIR=/var/backups/salesdb /path/ke/sales-system/ops/backup_production_db.sh >> /var/log/salesdb_backup.log 2>&1
```
- `MAILTO` supaya kegagalan cron (exit non-zero) terkirim email, bukan diam-diam gagal.
- Jam 02:00 dipilih sebagai contoh (low-traffic) — sesuaikan.
- **Jangan taruh password langsung di crontab kalau bisa dihindari** — alternatif lebih aman: taruh `PGPASSWORD=...` di file `~/.pgpass` (format `host:port:database:user:password`, `chmod 600`) dan hapus baris `export PGPASSWORD` — `pg_dump` otomatis baca file itu.

Prasyarat: `pg_dump`/`psql` versi yang cocok dengan Postgres 15 harus terpasang
di server yang menjalankan cron ini (`apt install postgresql-client-15` atau
sesuai versi OS-nya).

## Backup offsite

Fase 0 poin 3 (dari roadmap awal) secara eksplisit minta backup TIDAK BOLEH
cuma tersimpan di host yang sama dengan DB produksi — kalau host itu
bermasalah, backup lokal ikut hilang. `ops/backup_production_db.sh` punya
bagian ber-komentar di akhir file dengan 3 contoh (rsync ke host lain, AWS S3,
rclone) — **pilih salah satu dan konfigurasikan**, ini keputusan yang belum
ada infrastrukturnya (belum tahu Anda mau simpan ke mana), jadi belum
diaktifkan otomatis.

## Uji restore berkala

```bash
./ops/test_restore_backup.sh /var/backups/salesdb/daily/salesdb_<timestamp>.sql.gz
```
Sudah dites dan berfungsi (lihat catatan verifikasi di bawah) — menyalakan
container Postgres sekali-pakai di port 55432 (ubah lewat `TEST_RESTORE_PORT`
kalau bentrok), restore, cek row count `users`/`customers`/`projects`, lalu
buang container-nya. Tidak menyentuh DB produksi/staging manapun. Jadwalkan
manual berkala (mis. sekali sebulan) — belum di-cron-kan otomatis karena
idealnya ada manusia yang membaca hasil sanity check-nya, bukan cuma exit code.

## Rotasi password

1. Generate password baru yang kuat, mis. `openssl rand -base64 24`.
2. Di server produksi, buat/isi file `.env` (SEJAJAR dengan `docker-compose.yml`,
   **JANGAN commit** — sudah di-`.gitignore`) isi dengan:
   ```
   POSTGRES_PASSWORD=<password-baru>
   ```
   (`docker-compose.yml` di repo ini SUDAH diubah sesi ini untuk baca dari
   `${POSTGRES_PASSWORD}`, bukan hardcode `sales123` — jadi tinggal isi 1
   tempat ini, tidak perlu edit `docker-compose.yml` lagi ke depannya.)
3. Restart bertahap (supaya tidak downtime total): kalau Postgres container
   di-restart dengan `POSTGRES_PASSWORD` baru, itu HANYA berlaku untuk init
   database BARU (image `postgres` cuma pakai env var itu saat volume kosong
   pertama kali) — karena volume `postgres_data` sudah ada isinya, password
   role Postgres yang SUDAH JALAN harus diubah lewat SQL dulu, env var baru
   cuma dipakai backend/frontend buat connect:
   ```bash
   docker exec -it <container_postgres> psql -U sales -d salesdb -c "ALTER USER sales WITH PASSWORD '<password-baru>';"
   ```
4. Baru setelah itu `docker compose up -d` (akan restart backend+frontend
   dengan DSN baru dari `.env`, postgres container sendiri tidak perlu restart
   karena passwordnya sudah diubah langsung via SQL di langkah 3).
5. Verifikasi: buka aplikasi, pastikan masih bisa login & load data (bukti
   backend berhasil connect pakai password baru).
6. Simpan password baru di password manager tim — JANGAN taruh di file lain
   yang ikut ter-commit.

## Verifikasi yang sudah dilakukan sesi ini (di sandbox, BUKAN produksi)

- `docker-compose.yml` — divalidasi `docker compose config` sukses dengan
  `POSTGRES_PASSWORD` dummy, tidak ada error YAML/interpolasi.
- `ops/test_restore_backup.sh` — dites end-to-end 2x: (1) dump valid berisi
  3 tabel + beberapa baris → restore sukses, row count benar, container
  otomatis dibersihkan; (2) dump SENGAJA rusak (bukan SQL valid) → script
  BERHENTI dengan exit code 1 dan menampilkan log error, container tetap
  dibersihkan (bukti `trap cleanup EXIT` bekerja di kedua skenario).
- `ops/backup_production_db.sh` — logika rotasi retensi (`prune`) diuji
  terpisah dengan 10 file dummy bertanggal beda: benar menyisakan 7 file
  terbaru & menghapus 3 file tertua saat `RETAIN=7`. **Bagian `pg_dump`-nya
  sendiri TIDAK bisa dites penuh di sandbox ini** (tidak ada akses root utk
  install `postgresql-client-15` yang cocok) — perintah `pg_dump`-nya standar
  (`-h -p -U -d --no-owner --no-privileges`), tapi tetap disarankan jalankan
  "Jalankan manual (sekali, untuk tes)" di atas begitu berada di server
  produksi, sebelum mengandalkan cron-nya sepenuhnya.
