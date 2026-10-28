# Staging Business Process Sign-off

Tanggal draft: 2026-10-28  
Branch: `staging`  
Status: draft untuk konfirmasi pemilik proses bisnis

Keputusan teknis saat ini: **staging siap untuk melanjutkan UAT/pilot
terbatas, tetapi belum menjadi release candidate atau go-live**. Penyebabnya
adalah sign-off bisnis, persistensi perubahan ke Git, dan backup offsite yang
belum selesai.

Dokumen ini menjadi checklist proses Mini ERP dari awal sales sampai laporan
keuangan. Dokumen ini belum mengubah aturan aplikasi. Nama approver dan batas
nominal harus disahkan melalui konfigurasi Approval Matrix setelah pemilik
proses menyetujuinya.

## Preflight teknis terbaru — 2026-10-28

- Backend staging `http://202.50.203.136:8091/health`: `200`.
- Backend staging `http://202.50.203.136:8091/ready`: `200`.
- Frontend staging `http://202.50.203.136:3010/`: `200`.
- Endpoint terlindungi `/api/projects`, `/api/users`, dan
  `/api/approval-matrices` tanpa autentikasi: `401`.
- Akun UAT baru berhasil login dengan status `200`; akun read-only berhasil
  membaca project (`200`) dan ditolak saat membuat customer (`403`).
- Audit integritas database setelah provisioning akun: seluruh pemeriksaan
  menghasilkan `0 violations`.

Pemeriksaan ini bersifat read-only dan tidak mengubah data staging.

## Akun UAT yang disiapkan

Akun berikut dibuat langsung di database staging dan tidak disimpan di Git.
Password bersifat sementara dan harus dihapus/dirotasi setelah UAT selesai.

| Username | Role | Division | Manager | Read-only |
|---|---|---|---|---|
| `codex_sales_staff_uat` | Sales IT Solutions - Staff | IT Solutions | `codex_sales_manager_uat` | Tidak |
| `codex_sales_manager_uat` | Sales IT Solutions - Manager | IT Solutions | `codex_exec` | Tidak |
| `codex_prodev_staff_uat` | Network Solutions - Staff | Product & Development | `codex_prodev_manager_uat` | Tidak |
| `codex_prodev_manager_uat` | Network Solutions - Manager | Product & Development | `codex_exec` | Tidak |
| `codex_sales_readonly_uat` | Sales IT Solutions - Staff | IT Solutions | - | Ya |

## Alur utama

| Tahap | Input | Aktivitas dan output | Pemilik proses | Gate wajib | Status teknis |
|---|---|---|---|---|---|
| 1. Sales dan customer | Lead/customer/prospek | Customer dan project dibuat, pipeline diperbarui | Sales | Customer tidak duplikat; project memiliki owner dan division | Tersedia; UAT bisnis perlu dikonfirmasi |
| 2. Presales dan BoQ | Project, kebutuhan customer | Presales, BoQ, SPH/harga, dan Sales Order disiapkan | Product & Development / Sales | Nilai, margin, item, dan versi BoQ tercatat | Tersedia; UAT bisnis perlu dikonfirmasi |
| 3. Project/META dan revenue | Project yang siap dieksekusi | META/billing request diajukan dan disetujui | Sales / Project Owner / Finance | Matrix approval aktif; requester tidak boleh approve sendiri | UAT META → Invoice selesai |
| 4. Pengadaan | Kebutuhan project yang disetujui | Purchase Request dibuat, disetujui, lalu Purchase Order diterbitkan | Operations / Procurement | PR dan PO memiliki project, vendor, nilai, dan approval yang sah | UAT PR → PO selesai |
| 5. Pelaksanaan dan serah terima | PO, pekerjaan/barang | BAST Vendor dan BAST Customer dibuat dan diselesaikan | Operations / Project Owner | Kuantitas dan nilai tidak melebihi dokumen sumber; bukti serah terima tersedia | UAT BAST selesai |
| 6. Penagihan dan penerimaan | META/BAST/invoice source | Invoice dibuat, dikirim, payment schedule dipantau sampai paid | Finance | Invoice tidak ganda; status hanya melalui transisi sah; bukti pembayaran tercatat | UAT Invoice → Paid selesai |
| 7. Akuntansi dan laporan | Invoice, payment, cost | Jurnal otomatis, GL, AR/AP aging, cash flow, income statement, profitability | Finance | Debit-kredit balance; committed/paid/billed konsisten | UAT finance dan profitability selesai |
| 8. Monitoring dan audit | Seluruh transaksi | Executive dashboard, audit log, document expiry, dan work queue dipantau | Executive / System Admin / Process Owner | Perubahan penting terlacak; akses read-only tetap read-only | Endpoint utama dan audit integrity lulus |

## Aturan lintas tahap

1. Setiap transaksi harus memiliki project dan pemilik proses yang jelas.
2. Submission tanpa matrix approval, manager, atau approver yang sah harus
   ditolak; sistem tidak boleh auto-approve sebagai fallback.
3. Approver tidak boleh menyetujui transaksi yang dibuatnya sendiri.
4. Status transaksi hanya boleh bergerak melalui transisi yang ditentukan;
   perubahan status langsung di database tidak menjadi prosedur operasional.
5. User `read_only` hanya membaca data. Backend tetap menjadi kontrol utama,
   bukan sekadar penyembunyian tombol di frontend.
6. Dokumen upload, metadata database, dan backup harus diperlakukan sebagai
   satu pasangan pemulihan.
7. Data dummy UAT diberi identitas yang jelas dan tidak boleh bercampur dengan
   transaksi operasional ketika staging mulai dipakai untuk pilot.

## Konfirmasi yang masih diperlukan

| Keputusan | Rekomendasi awal | Status |
|---|---|---|
| Pemilik proses tiap tahap | Mengikuti kolom Pemilik proses di atas | Menunggu konfirmasi |
| Batas nominal approval | Dikelola di Approval Matrix, tidak hardcode | Menunggu angka bisnis |
| Urutan approval | Manager → GM sesuai unit; Executive hanya jika ditugaskan matrix | Menunggu konfirmasi |
| Syarat invoice | Hanya dari META/billing request approved dan sumber serah terima yang lengkap sesuai jenis transaksi | Menunggu Finance |
| Definisi profitability | Pisahkan committed, accrued/actual, paid, dan billed revenue | Menunggu Finance |
| Data UAT sebelum pilot | Pertahankan untuk audit atau arsipkan sesuai keputusan pemilik data | Menunggu keputusan |
| Backup offsite | S3-compatible private storage dengan encryption, versioning/Object Lock | Ditunda; wajib sebelum release candidate/go-live |

## Baseline rekomendasi untuk sign-off

Ini adalah baseline tata kelola yang direkomendasikan, bukan perubahan
otomatis pada konfigurasi bisnis:

- Sales Staff/Manager boleh mengelola Customer PO untuk project Sales.
- Submission BoQ/ProDev wajib disetujui manager requester sebelum ikut menjadi
  dasar Quotation.
- PR Operations mengikuti Manager → GM Operations.
- PO Procurement mengikuti manager requester.
- Finalisasi harga/presales Finance mengikuti manager requester.
- Batas nominal tidak ditetapkan oleh sistem sebelum angka resmi disahkan;
  konfigurasi saat ini tidak boleh dianggap sebagai persetujuan nominal.
- Data UAT dipertahankan selama pilot sebagai evidence, kemudian diarsipkan
  setelah pemilik data menyetujui tanggal dan metode pembersihan.

## UAT tahap Sales sampai Sales Order

Gunakan prefix data `UAT-SALES-20261028` dan akun dummy yang sudah disetujui.
Jangan memakai customer, project, atau transaksi operasional yang sudah ada.

| ID | Skenario | Ekspektasi | Status |
|---|---|---|---|
| S1 | Sales membuat customer baru | Customer tersimpan tanpa duplikat dan terlihat sesuai division | Lulus — customer `92` |
| S2 | Sales membuat project dari customer | Project memiliki owner, division, status awal, dan dapat dicari | Lulus — project `622` / `PRJ-ITS-2026-0060` |
| S3 | Sales mengisi pipeline dan dokumen project | Status pipeline berubah sah; dokumen dapat di-upload/download; audit tercatat | Sebagian — gate project selesai; upload belum diuji |
| S4 | Sales menandai dokumen lengkap | Project masuk ke gate Prodev; user tanpa hak tidak dapat mengubah gate | Lulus — stage maju ke Presales |
| S5 | Product & Development mengisi analisis dan BoQ | Hanya bagian yang berwenang yang dapat mengubah; histori BoQ tercatat | Lulus sebagian — BoQ `19` dan approval manager `50` selesai |
| S6 | Role lintas departemen mencoba mengubah BoQ/presales | Backend menolak dengan `403` bila tidak memiliki scope/permission | Lulus — Sales mendapat `403` saat membuat BoQ |
| S7 | Project ditutup sebagai Won sesuai proses | Sales Order terbentuk otomatis; tidak ada pembuatan Sales Order manual ganda | Lulus — `SO-0036`, satu item BoQ |
| S8 | Sales menambahkan Customer PO | Customer PO terhubung ke Sales Order dan nilai tervalidasi | Lulus — Customer PO `5`, total `160.000.000` |
| S9 | User read-only mengakses seluruh alur | GET berhasil sesuai scope; POST/PUT/DELETE ditolak `403` | Lulus smoke test |
| S10 | Penolakan/invalid input | Nilai negatif, project/customer tidak sah, atau transisi status ilegal ditolak tanpa data parsial | Lulus — pipeline invalid ditolak `400`, project tetap `Closed/Win` |

UAT berjalan pada project `622` dengan customer `92`. Approval ProDev request
`50` sudah disetujui oleh `codex_prodev_manager_uat`. Keempat bagian presales
sudah submitted dan approval harga request `51` sudah disetujui oleh
`codex_exec`. Project berhasil melalui Quotation → Win, membentuk `SO-0036`,
dan menerima Customer PO `5`. Audit integritas setelah Customer PO tetap
menghasilkan `0 violations`.

Backup offsite ditunda atas keputusan tim. Staging tetap dapat dipakai untuk
pengembangan dan UAT, tetapi belum boleh diperlakukan sebagai release
candidate atau sistem go-live sampai backup offsite dan uji restore-nya selesai.

Kriteria lulus tahap ini: seluruh skenario S1–S10 memiliki bukti screenshot/API
response, tidak ada data parsial, dan audit log dapat ditelusuri berdasarkan
user serta project UAT.

## Exit criteria Release Candidate

Staging belum dinyatakan siap pilot sampai seluruh item berikut terpenuhi:

- [ ] Pemilik proses dan approver disahkan.
- [ ] Batas nominal dan pengecualian disetujui.
- [ ] UAT UI dan API untuk setiap role selesai.
- [ ] Alur normal dan minimal satu skenario penolakan/rollback diuji.
- [ ] Audit integrity menghasilkan `0 violations` setelah UAT terakhir.
- [ ] Backup database dan upload lokal berhasil serta restore teruji.
- [ ] Backup offsite terenkripsi tersedia dan restore dari salinan offsite
      berhasil.
- [ ] Checklist pilot, monitoring, dan rollback disetujui.

## Referensi

- [REVIEW_STAGING_2026-10-26.md](REVIEW_STAGING_2026-10-26.md)
- [ROLE_PERMISSION_TEST_MATRIX_STAGING.md](ROLE_PERMISSION_TEST_MATRIX_STAGING.md)
- [ops/STAGING_STORAGE.md](ops/STAGING_STORAGE.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
