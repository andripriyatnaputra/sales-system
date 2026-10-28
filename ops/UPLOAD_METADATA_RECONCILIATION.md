# Rekonsiliasi Metadata–File Upload

Runbook ini bersifat **read-only**. Jalankan terpisah pada staging dan
production sebelum merge atau release candidate. Jangan menghapus metadata,
file, volume, atau orphan file berdasarkan hasil audit ini.

## Tujuan

Membandingkan:

1. path file yang direferensikan database;
2. file fisik pada volume upload;
3. metadata tanpa file (missing path);
4. file tanpa metadata (orphan file); dan
5. cakupan project serta rentang waktu upload.

## 1. Snapshot metadata database

Sesuaikan nama compose project/service, user, dan database dengan environment.
Nilai password tidak boleh ditulis ke command history atau evidence.

```bash
docker compose -f <compose-file> -p <compose-project> exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "COPY (
    SELECT 'project_documents' AS source, id::text AS metadata_id,
           project_id::text AS project_id, file_path, created_at
    FROM project_documents
    UNION ALL
    SELECT 'presales_documents', id::text, project_id::text, file_path, created_at
    FROM presales_documents
    ORDER BY source, metadata_id
  ) TO STDOUT WITH CSV HEADER" \
  > metadata-upload-<environment>-<timestamp>.csv
```

Jika environment memiliki attachment table lain, audit table tersebut sebagai
file terpisah dengan format yang sama. Simpan hanya path, id, project, dan
timestamp; jangan masukkan isi file atau secret.

## 2. Snapshot file fisik

Ganti `<upload-volume>` dengan named volume yang benar dan gunakan mount
read-only. Contoh berikut hanya membaca volume:

```bash
docker run --rm \
  -v <upload-volume>:/uploads:ro \
  alpine:3.18 \
  sh -c "cd /uploads && find . -type f -printf '%P\t%s\t%TY-%Tm-%TdT%TH:%TM:%TS\n' | sort" \
  > files-upload-<environment>-<timestamp>.tsv
```

Untuk production, approval IT wajib memastikan nama volume dan host benar
sebelum command dijalankan. Jangan menjalankan command dengan mount writable.

## 3. Rekonsiliasi

Bandingkan kolom `file_path` pada CSV metadata dengan kolom path pada TSV file
fisik setelah normalisasi berikut:

- hapus prefix `./` dari hasil `find`;
- gunakan separator `/`;
- jangan mengikuti symlink untuk menghitung file fisik;
- pertahankan project id dan source table untuk penelusuran.

Output minimum yang harus disimpan:

| Hasil | Wajib dicatat |
|---|---|
| Metadata total | Jumlah per source table dan total project unik |
| File fisik total | Jumlah file, ukuran total, dan rentang mtime |
| Missing path | Source, metadata id, project id, file path, created_at |
| Orphan file | File path dan mtime |
| Coverage | Jumlah project yang memiliki metadata/file dan total project database |

Setiap missing path harus diberi disposition pemilik data: dipulihkan dari
sumber asli, metadata ditandai/diarsipkan, atau dibuka sebagai defect. Tidak
boleh ditutup hanya karena archive dapat diekstrak tanpa error.

## 4. Kriteria release

- Staging: project `618` dan cakupan seluruh project harus direkonsiliasi.
- Production: audit read-only wajib selesai sebelum merge yang mengubah storage,
  upload, CSRF, deployment volume, atau backup.
- Backup/restore baru dianggap lulus jika database dan volume upload berasal dari
  rentang waktu yang kompatibel dan seluruh missing path telah didisposisikan.
- Output production tidak boleh disimpan di repository bila mengandung nama
  customer, email, atau path sensitif; simpan di lokasi evidence terbatas dan
  cantumkan checksum/metadata artefaknya pada handoff.
