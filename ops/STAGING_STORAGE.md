# Staging storage & upload backup runbook

Staging menyimpan upload aplikasi di Docker named volume
`sales-staging_uploads_staging`, mounted ke backend sebagai `/app/uploads`.
Database tetap memakai `postgres_data_staging`. Keduanya sengaja dipisahkan:
backup database tidak otomatis membawa file upload.

Backup database dan backup upload harus dijalankan sebagai dua artefak yang
berpasangan. Database menyimpan metadata `file_path`, sedangkan file fisiknya
ada di named volume.

> **Catatan ditunda (2026-10-28):** lokasi backup offsite belum tersedia dan
> konfigurasi sengaja ditunda. Backup lokal cukup untuk melanjutkan development
> dan UAT staging, tetapi belum memenuhi pemulihan bencana apabila host server
> rusak. Storage offsite terpisah (disarankan S3-compatible private bucket
> dengan encryption, versioning/Object Lock, dan akun khusus backup) tetap
> wajib sebelum release candidate/go-live.

## Dampak deployment

Workflow staging mengunggah dan menjalankan `migrate_staging_uploads.sh` sebelum
backend dibuat ulang. Pada deployment pertama setelah volume ditambahkan, script
menyalin isi `/app/uploads` dari container backend lama ke named volume. Jadi
metadata database dan file lama tidak tertutup oleh mount volume baru.

Setelah deployment, verifikasi di server:

```bash
docker volume inspect sales-staging_uploads_staging
docker compose -f docker-compose.staging-server.yml -p sales-staging ps
```

Jangan menghapus volume `sales-staging_uploads_staging` ketika membersihkan
container. Penghapusan volume akan menghapus file upload staging.

## Backup manual

Jalankan di server staging sebagai user yang boleh menjalankan Docker:

```bash
export STAGING_DB_BACKUP_DIR=/var/backups/sales-staging-db
export STAGING_UPLOAD_BACKUP_DIR=/var/backups/sales-staging-uploads
./ops/backup_staging_all.sh
```

Runner menjalankan backup database lebih dahulu, lalu upload. Masing-masing
script membuat tier `daily`, `weekly`, dan `monthly`, menyimpan checksum
SHA-256, lalu menerapkan retensi 7/5/12. Lock mencegah dua backup berjalan
bersamaan. Permission file backup dibuat private (`umask 077`). Backup ini masih lokal di server;
sesuai kebijakan umum, salin ke lokasi offsite yang sudah disetujui sebelum
dianggap sebagai backup pemulihan bencana.

Backup database staging dijalankan terpisah dari container PostgreSQL staging:

```bash
export STAGING_DB_BACKUP_DIR=/var/backups/sales-staging-db
./ops/backup_staging_db.sh
```

Contoh cron tunggal yang menjaga urutan database lalu upload:

```cron
0 2 * * * STAGING_DB_BACKUP_DIR=/var/backups/sales-staging-db STAGING_UPLOAD_BACKUP_DIR=/var/backups/sales-staging-uploads /home/it/sales-system-staging/ops/backup_staging_all.sh >> /var/log/sales-staging-backup.log 2>&1
```

Sesuaikan path dan user server. Jangan menaruh secret di script atau commit
folder backup ke repository.

## Uji restore

Uji ini membuat Docker volume disposable dan tidak menyentuh volume staging:

```bash
./ops/test_restore_staging_uploads.sh \
  /var/backups/sales-staging-uploads/daily/uploads_<timestamp>.tar.gz
```

Jalankan setelah backup pertama dan berkala, minimal bulanan. Uji harus
menghasilkan jumlah file yang dipulihkan tanpa error tar. Untuk pemulihan
operasional, database harus dipulihkan dari backup database yang cocok dengan
rentang waktu archive upload; metadata `file_path` di database adalah sumber
referensi file.

Uji restore database staging secara terisolasi:

```bash
./ops/test_restore_staging_db.sh \
  /var/backups/sales-staging-db/daily/salesdb_staging_<timestamp>.sql.gz
```

Script ini membuat container PostgreSQL disposable, menjalankan restore, dan
menghapus container tersebut setelah selesai. Tidak menyentuh database
staging yang aktif.

## Verifikasi aplikasi

Setelah deployment pertama:

1. Ambil satu dokumen proyek lama dan pastikan dapat di-download.
2. Upload satu file uji melalui project document, work request attachment,
   dan payment proof bila datanya tersedia.
3. Download kembali file tersebut.
4. Jalankan backup dan uji restore archive.

File upload tidak di-commit ke Git dan tidak disimpan di image Docker.
