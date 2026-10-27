# Matriks Akses dan Uji Role — Staging

Tanggal: 2026-10-27

Dokumen ini adalah baseline teknis untuk validasi staging. Akses baca/tulis
lintas departemen tetap harus dikonfirmasi pemilik proses bisnis sebelum
dianggap sebagai aturan final Mini ERP.

## Role yang tersedia

| Role/level | Sumber | Status pengujian |
| --- | --- | --- |
| Staff | org unit | Belum dibuat akun test khusus |
| Manager | org unit | Belum dibuat akun test khusus |
| GM | departemen tertentu | Belum dibuat akun test khusus |
| Executive | lintas departemen | Belum dikonfirmasi akses tulis |
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

## Temuan dan keputusan

Role `executive` menggunakan `legacy_role = 'admin'` untuk kompatibilitas
lama, tetapi gate baru harus memeriksa `role_key/level = system_admin`, bukan
sekadar legacy role. Dengan demikian Executive tidak otomatis mendapat bypass
akses tulis seperti System Admin.

Keputusan bisnis yang sudah disepakati:

1. Executive fokus membaca dashboard/laporan dan hanya menyetujui transaksi
   yang secara eksplisit ditetapkan dalam approval matrix.
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
