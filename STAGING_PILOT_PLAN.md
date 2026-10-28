# Staging Pilot Plan

Tanggal: 2026-10-28  
Branch: `staging`  
Status: rancangan pilot terbatas

Pilot ini bertujuan memvalidasi proses bisnis dengan pengguna terbatas sebelum
staging dianggap sebagai release candidate. Pilot bukan cutover production dan
tidak boleh menggunakan data production.

## Entry criteria

- [x] CI/CD staging terakhir sukses.
- [x] Backend health/readiness dan frontend merespons normal.
- [x] Role, read-only, approval, audit, dan migration utama telah diuji.
- [x] Backup lokal database/upload dan restore test tersedia.
- [ ] Pemilik proses dan approval limit menandatangani matriks bisnis.
- [ ] Daftar peserta pilot dan periode pilot disetujui.
- [ ] Risiko backup offsite dicatat sebagai risk acceptance sementara.

## Scope pilot

| Area | Peserta utama | Skenario minimum |
|---|---|---|
| Sales | Sales Staff/Manager | Customer, project, pipeline, dokumen, Sales Order, Customer PO |
| Product & Development | Prodev Staff/Manager | Analisis solusi, BoQ, histori, approval manager |
| Operations | Operations Staff/Manager/GM | PR, approval berjenjang, pelaksanaan, BAST |
| Procurement | Procurement | Vendor, PO, termin pembayaran |
| Finance | Finance | Billing, invoice, payment, jurnal, AR/AP, profitability |
| Executive | Executive | Dashboard, laporan, approval yang ditugaskan, tanpa write bypass |
| System Admin | System Admin | User/role, approval matrix, audit log, monitoring |

## Aturan pelaksanaan

1. Semua data pilot diberi prefix atau label yang jelas, misalnya `PILOT-2026`.
2. Tidak boleh mengubah transaksi production atau approval pending existing.
3. Setiap transaksi harus mengikuti alur normal UI; API hanya dipakai untuk
   verifikasi bila diperlukan.
4. Setiap defect dicatat dengan user, waktu, project, endpoint/halaman, dan
   bukti response atau screenshot.
5. Jangan menghapus data pilot selama periode pengamatan tanpa persetujuan
   Process Owner.
6. Password akun dummy tidak boleh dimasukkan ke Git atau dokumen repository.

## Skenario acceptance pilot

- [ ] Customer → Project → pipeline.
- [ ] Project → presales/BoQ → approval manager.
- [ ] Project approved → Quotation/Win → Sales Order → Customer PO.
- [ ] PR → approval Manager/GM → PO → payment schedule.
- [ ] PO → BAST Vendor/Customer.
- [ ] META/billing request → invoice → payment → jurnal.
- [ ] Profitability, AR/AP aging, dashboard, dan laporan keuangan konsisten.
- [ ] Upload, download, expiry, dan penghapusan dokumen sesuai hak akses.
- [ ] Read-only dapat membaca tetapi seluruh perubahan data ditolak `403`.
- [ ] Invalid input dan rejection tidak menghasilkan data parsial.

## Monitoring selama pilot

Minimal setiap hari periksa:

- `/health` dan `/ready`.
- Container status dan restart count.
- Log error backend/frontend tanpa secret.
- Approval yang pending terlalu lama.
- Audit log untuk perubahan user, approval, transaksi, dan dokumen.
- Backup lokal berjalan dan checksum valid.

## Exit criteria

Pilot dapat ditutup jika:

- Tidak ada defect Sev-1/Sev-2 yang terbuka.
- Seluruh Process Owner menyetujui alur dan hasil laporan.
- Approval limit dan pengecualian telah disahkan.
- Rekonsiliasi transaksi dan laporan tidak memiliki selisih yang belum
  dijelaskan.
- Data pilot diputuskan: dipertahankan sebagai evidence atau diarsipkan.
- Risk acceptance backup offsite diperbarui atau backup offsite sudah aktif.
- Checklist rollback dan komunikasi pengguna disetujui.

## Sign-off

| Area | Process Owner | Keputusan | Tanggal |
|---|---|---|---|
| Sales |  | Pending |  |
| Product & Development |  | Pending |  |
| Operations |  | Pending |  |
| Procurement |  | Pending |  |
| Finance |  | Pending |  |
| Executive |  | Pending |  |
| System Admin/IT |  | Pending |  |

Referensi: [STAGING_BUSINESS_PROCESS_SIGNOFF.md](STAGING_BUSINESS_PROCESS_SIGNOFF.md)
