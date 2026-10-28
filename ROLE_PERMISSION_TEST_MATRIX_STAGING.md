# Matriks Akses dan Uji Role — Staging

Tanggal: 2026-10-27

Dokumen ini adalah baseline teknis untuk validasi staging. Akses baca/tulis
lintas departemen tetap harus dikonfirmasi pemilik proses bisnis sebelum
dianggap sebagai aturan final Mini ERP.

## Role yang tersedia

| Role/level | Sumber | Status pengujian |
| --- | --- | --- |
| Staff | org unit | Akun UAT `codex_ops_staff` tersedia |
| Manager | org unit | Akun UAT `codex_ops_manager` tersedia |
| GM | departemen tertentu | Akun UAT `codex_ops_gm` tersedia |
| Executive | lintas departemen | Akun UAT `codex_exec`; baca + keputusan approval yang ditugaskan |
| System Admin | lintas departemen | Akun `admin` tersedia |
| Read-only | flag user, lintas role | Sudah berhasil diuji |

## Gate teknis saat ini

| Area | Gate backend | Ekspektasi awal |
| --- | --- | --- |
| Semua perubahan data | `BlockReadOnly` | User read-only selalu mendapat `403` |
| User management | `users.manage` | System Admin saja |
| Role/org unit | `roles.manage` | System Admin saja |
| Audit log | `audit.view` | System Admin atau role yang nanti ditetapkan |
| Sales project core | Sales/admin | Sales mengelola project; role lain membaca dan mengisi bagian masing-masing |
| Presales/BoQ | Product & Development | Hanya departemen terkait yang menulis |
| Purchase Request dan BAST | Operations | Hanya Operations yang menulis |
| Purchase Order | Procurement | Hanya Procurement yang menulis |
| Invoice, GL, COA, cost | Finance | Hanya Finance yang menulis |
| Hourly rate | Finance/HR GA & Legal | Hanya departemen terkait yang menulis |
| Executive dashboard | level GM atau lebih tinggi | Baca agregat, bukan otomatis hak mengubah transaksi |

## Kontrol approval yang wajib

| Kondisi | Perilaku backend |
| --- | --- |
| Matrix tidak ditemukan | Submission ditolak (`422`); tidak pernah auto-approved |
| Requester tidak punya manager | Submission ditolak (`422`); tidak ada step yang di-skip |
| Role approver tidak punya user yang dapat bertindak | Submission ditolak (`422`) |
| Requester mencoba approve/reject dokumen sendiri | Ditolak |
| Rejection tanpa alasan | Ditolak |
| Dua approver memproses step yang sama | Hanya satu yang berhasil; lainnya diminta refresh |
| Approval berhasil | Step dan status request diperbarui dalam satu transaksi |

Konfigurasi matrix dikelola melalui menu **Approval Matrix** oleh System Admin
saja. Perubahan create/update/delete masuk audit log. Migration tidak mengisi
threshold bisnis secara otomatis; setiap rule harus disahkan pemilik proses.

Approval request yang sudah dibuat harus selalu memiliki minimal satu step
`pending` sampai approver yang sah mengambil keputusan. Konfigurasi matrix dan
penetapan `manager_id` wajib diselesaikan sebelum uji end-to-end Mini ERP.

## Preflight UAT staging — 2026-10-28

- PostgreSQL dan backend sehat; frontend merespons `200`.
- Endpoint utama merespons `200` dengan konteks System Admin.
- Write request dari akun read-only dan Executive ditolak `403` sesuai kebijakan.
- Audit integritas transaksi menghasilkan `0 violations` pada seluruh pemeriksaan.
- Mapping manager akun dummy telah diterapkan melalui API admin dan diverifikasi:
  `codex_ops_unassigned` → `codex_ops_manager`, `codex_ops_gm` → `codex_exec`,
  `codex_finance_manager` → `codex_exec`.
- Approval pending existing milik `dani.swandani` tidak disentuh; akun tersebut
  bukan data UAT.

Preflight teknis selesai. UAT berikutnya harus membuat transaksi dummy baru
dan tidak mengubah approval pending atau transaksi existing.

UAT pertama sudah dijalankan pada alur META → approval → Invoice dengan data
dummy baru: `META-0016` dibuat oleh `codex_ops_staff`, disetujui berurutan oleh
`codex_ops_manager` dan `codex_finance_manager` pada approval request `46`,
lalu menghasilkan Invoice `INV-0011` berstatus `draft`.

Hardening approval sudah diterapkan pada commit `97dcb49` dan terverifikasi di
staging. UAT lanjutan membuat META `17`, menyelesaikan approval request `47`,
melihat status META langsung menjadi `approved`, lalu membuat Invoice `INV-0012`
tanpa membuka detail META terlebih dahulu.

UAT berikutnya juga selesai untuk alur procurement dan serah terima: `PR-0028`
disetujui Manager Operations lalu GM Operations, `PO-0020` disetujui Executive,
termin pembayaran `25` menjadi `due`, kemudian BAST Vendor `BASTV-0009` dan
BAST Customer `BASTC-0012` berstatus `complete`. Audit integritas setelah UAT
tetap menghasilkan `0 violations`.

## Temuan dan keputusan

Role `executive` menggunakan `legacy_role = 'admin'` untuk kompatibilitas
lama, tetapi gate baru harus memeriksa `role_key/level = system_admin`, bukan
sekadar legacy role. Dengan demikian Executive tidak otomatis mendapat bypass
akses tulis seperti System Admin.

Keputusan bisnis yang sudah disepakati:

1. Executive fokus membaca dashboard/laporan dan hanya memproses keputusan
   approval yang secara eksplisit ditugaskan dalam approval matrix. Endpoint
   perubahan bisnis lainnya ditolak oleh middleware.
2. Bypass lintas departemen hanya untuk System Admin.
3. GM fokus review/approval departemennya; batas nominal ditetapkan di approval
   matrix dan tidak di-hardcode.
4. User, role, dan permission dikelola oleh System Admin.

## Urutan uji setelah keputusan bisnis

1. System Admin: create/update user dan role.
2. Read-only: seluruh GET berhasil, seluruh POST/PUT/DELETE ditolak `403`.
3. Sales Staff/Manager: project dan customer sesuai scope Sales/division.
4. Product & Development: presales/BoQ, tidak boleh mengubah field Finance atau Procurement.
5. Operations: PR/BAST/META, tidak boleh mengubah master Finance.
6. Procurement: PO/vendor sesuai scope Procurement.
7. Finance: cost, invoice, GL, dan laporan keuangan.
8. Executive: akses baca dan approval sesuai keputusan bisnis, tanpa asumsi bypass.

Setiap skenario diuji pada UI dan API langsung. UI boleh menyembunyikan tombol,
tetapi `403` dari backend tetap menjadi kriteria keamanan utama.
