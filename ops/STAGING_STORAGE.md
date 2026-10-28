# Staging storage & upload backup runbook

Staging menyimpan upload aplikasi di Docker named volume
`sales-staging_uploads_staging`, mounted ke backend sebagai `/app/uploads`.
Database tetap memakai `postgres_data_staging`. Keduanya sengaja dipisahkan:
backup database tidak otomatis membawa file upload.

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
export STAGING_UPLOAD_BACKUP_DIR=/var/backups/sales-staging-uploads
./ops/backup_staging_uploads.sh
```

Script membuat tier `daily`, `weekly`, dan `monthly`, menyimpan checksum
SHA-256, lalu menerapkan retensi 7/5/12. Backup ini masih lokal di server;
sesuai kebijakan umum, salin ke lokasi offsite yang sudah disetujui sebelum
dianggap sebagai backup pemulihan bencana.

Contoh cron harian pukul 02:30:

```cron
30 2 * * * STAGING_UPLOAD_BACKUP_DIR=/var/backups/sales-staging-uploads /home/it/sales-system-staging/ops/backup_staging_uploads.sh >> /var/log/sales-staging-uploads-backup.log 2>&1
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

## Verifikasi aplikasi

Setelah deployment pertama:

1. Ambil satu dokumen proyek lama dan pastikan dapat di-download.
2. Upload satu file uji melalui project document, work request attachment,
   dan payment proof bila datanya tersedia.
3. Download kembali file tersebut.
4. Jalankan backup dan uji restore archive.

File upload tidak di-commit ke Git dan tidak disimpan di image Docker.
