# Evidence Backup dan Restore Staging — 2026-10-28

Status: **backup dan restore teknis lulus; rekonsiliasi metadata-file masih terbuka**

Server: `202.50.203.136`  
Project: `sales-staging`  
Waktu: 2026-10-28, WIB

## 1. Backup lokal

Perintah yang dijalankan di server:

```bash
cd /home/it/sales-system-staging
STAGING_DB_BACKUP_DIR=/home/it/sales-system-staging/backups/db ./backup_staging_db.sh
STAGING_UPLOAD_BACKUP_DIR=/home/it/sales-system-staging/backups/uploads ./backup_staging_uploads.sh
```

Hasil:

| Objek | Hasil | Artefak |
|---|---|---|
| Database | Sukses, 96K | `backups/db/daily/salesdb_staging_20261028_193448.sql.gz` dan `.sha256` |
| Upload volume | Sukses, 1.7M | `backups/uploads/daily/uploads_20261028_193448.tar.gz` dan `.sha256` |
| Retensi | Selesai | daily=7, weekly=5, monthly=12 |

Lokasi `/var/backups` tidak dapat ditulis oleh user `it`, sehingga evidence ini
menggunakan direktori milik deployment user. Sebelum production/go-live,
lokasi backup harus dipastikan memiliki permission, monitoring, dan proteksi
yang disetujui IT.

## 2. Restore test disposable

Perintah yang dijalankan:

```bash
./test_restore_staging_db.sh \
  /home/it/sales-system-staging/backups/db/daily/salesdb_staging_20261028_193448.sql.gz

./test_restore_staging_uploads.sh \
  /home/it/sales-system-staging/backups/uploads/daily/uploads_20261028_193448.tar.gz
```

Hasil:

- Restore database selesai tanpa error SQL.
- Hasil query verifikasi: `users=39`, `customers=85`, `projects=468`.
- Restore upload berhasil ke volume disposable dan menghasilkan `1` file.
- Container dan volume restore test bersifat disposable; staging aktif tidak
  diubah.

## 3. Temuan rekonsiliasi metadata-file

Database staging memiliki tiga metadata dokumen:

- `project_documents` project `618`: dua file;
- `presales_documents` project `618`: satu file.

Archive upload hanya berisi:

```text
projects/618/1793173269_6d0fbf7b33dc4187.pdf
```

Dua path metadata berikut tidak ditemukan dalam archive upload:

```text
projects/618/1786006060_b10fa08f282b9292.docx
projects/618/presales/prodev/1786006178_99eaa8b1dceb46a6.docx
```

Kesimpulan: backup database dan upload masing-masing dapat direstore, tetapi
**pemulihan pasangan metadata-file belum lulus**. Temuan ini harus dibuka
sebagai defect/data-reconciliation issue dan tidak boleh ditutup hanya dengan
hasil restore teknis.

## 4. Tindak lanjut

- Identifikasi apakah dua file tersebut sengaja dihapus tetapi metadata masih
  tersisa, atau hilang dari volume karena masalah upload/storage.
- Jangan menghapus metadata atau mengubah data project `618` tanpa keputusan
  pemilik data.
- Setelah keputusan perbaikan, jalankan backup ulang dan rekonsiliasi ulang.
- Jalankan audit read-only pada staging dan production mengikuti
  [ops/UPLOAD_METADATA_RECONCILIATION.md](ops/UPLOAD_METADATA_RECONCILIATION.md).
  Hasil production wajib tersedia sebelum merge yang memengaruhi storage/upload.
- Backup offsite dan restore dari offsite tetap wajib sebelum release candidate
  atau go-live.
