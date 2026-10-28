# Staging Business Process Sign-off

Dokumen handoff proses bisnis untuk Business Analyst tersedia di
[STAGING_BUSINESS_PROCESS_DOCUMENTATION.md](STAGING_BUSINESS_PROCESS_DOCUMENTATION.md).

Tanggal draft: 2026-10-28  
Branch: `staging`  
Status: draft untuk konfirmasi pemilik proses bisnis

Keputusan teknis saat ini: **staging dapat digunakan untuk melanjutkan UAT dan
persiapan pilot, tetapi belum menjadi release candidate atau go-live**.
Application/migration changes yang dipakai staging sudah berada di branch
`staging`/`origin/staging`; follow-up dokumentasi ini harus dipersist ke Git
sebelum dianggap selesai. File `.env.staging` dan data UAT sengaja tetap berada di server
dan tidak masuk Git. Penahan RC/go-live saat ini adalah sign-off bisnis,
evidence pilot yang lengkap, rekonsiliasi storage, dan backup offsite.

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
- Audit transaksi setelah provisioning akun menghasilkan `0 violations`; audit
  approval terbaru menemukan satu request legacy tanpa step dan masih terbuka.

Pemeriksaan ini bersifat read-only dan tidak mengubah data staging.

## Akun UAT yang disiapkan

Akun berikut dibuat langsung di database staging dan tidak disimpan di Git.
Password bersifat sementara dan harus dihapus/dirotasi setelah UAT selesai.

## Akun yang benar-benar digunakan dalam evidence UAT

| Username | Role/level | Division/scope | Manager | Read-only | Penggunaan evidence |
|---|---|---|---|---|---|
| `codex_sales_staff_uat` | IT Solutions Staff | Sales / IT Solutions | `codex_sales_manager_uat` | Tidak | Membuat project `622` dan SO `SO-0036` |
| `codex_sales_manager_uat` | IT Solutions Manager | Sales / IT Solutions | `codex_exec` | Tidak | UAT role Sales Manager |
| `codex_sales_readonly_uat` | IT Solutions Staff | Sales / IT Solutions | - | Ya | Smoke test read-only |
| `codex_prodev_staff_uat` | Network Solutions Staff | Product & Development | `codex_prodev_manager_uat` | Tidak | Requester approval `50` |
| `codex_prodev_manager_uat` | Network Solutions Manager | Product & Development | `codex_exec` | Tidak | Approver request `50` |
| `codex_ops_staff` | Implementations Staff | Operations / Implementations | `codex_ops_manager` | Tidak | Requester META/PR dan actor BAST |
| `codex_ops_manager` | Implementations Manager | Operations / Implementations | `codex_ops_gm` | Tidak | Approver request `46`/`47`/`48` |
| `codex_ops_gm` | Operations GM | Operations | `codex_exec` | Tidak | Approver step `48` |
| `codex_procurement_manager` | Procurement Manager | Procurement | `codex_exec` | Tidak | Pembuat PO `20` |
| `codex_finance_manager` | Finance Manager | Finance | `codex_exec` | Tidak | Pembuat Invoice `11`/`12` |
| `codex_finance_uat` | Finance Staff | Finance | `codex_exec` | Tidak | Requester approval harga `51` |
| `codex_exec` | Executive | Lintas departemen | - | Tidak | Approver request `49` dan `51` |

Tabel ini adalah daftar canonical actor; tabel akun lama yang sebelumnya
terduplikasi dihapus. Akun tambahan `codex_ops_uat`, `codex_ops_unassigned`, dan
`codex_procurement_uat` tersedia di staging tetapi belum menjadi actor evidence
utama.

Aturan rotasi/nonaktif berlaku untuk **seluruh username yang diawali `codex_`**,
baik memiliki suffix `_uat` maupun tidak. Tidak boleh ada akun `codex_*` yang
ditinggalkan sebagai akun operasional pilot.

### Catatan struktur manager dan Executive

Saat ini `codex_sales_manager_uat`, `codex_prodev_manager_uat`,
`codex_procurement_manager`, `codex_finance_manager`, dan `codex_ops_gm`
memiliki `codex_exec` sebagai `manager_id`. Karena itu, rule
`requester_manager` dapat membuat Executive menjadi approver untuk submission
manager tersebut. Approval `49` dan `51` adalah contoh aktual.

Ini bukan bypass teknis, tetapi **belum dapat dianggap sesuai baseline bisnis**
“Executive hanya bila ditugaskan matrix”. Manajemen harus memutuskan apakah
Executive memang menjadi approver semua request dari level manager, atau perlu
dibuat struktur manager/role approver yang lebih spesifik. Keputusan ini wajib
diterapkan dan diuji ulang sebelum RC.

## Alur utama

| Tahap | Input | Aktivitas dan output | Pemilik proses | Gate wajib | Status teknis |
|---|---|---|---|---|---|
| 1. Sales dan customer | Lead/customer/prospek | Customer dan project dibuat, pipeline diperbarui | Sales | Customer tidak duplikat; project memiliki owner dan division | Tersedia; UAT bisnis perlu dikonfirmasi |
| 2. Presales dan BoQ | Project, kebutuhan customer | Presales, BoQ, SPH/harga, dan Sales Order disiapkan | Product & Development / Sales | Nilai, margin, item, dan versi BoQ tercatat | Tersedia; UAT bisnis perlu dikonfirmasi |
| 3. Project/META dan revenue | Project yang siap dieksekusi | META/billing request diajukan dan disetujui | Sales / Project Owner / Finance | Matrix approval aktif; requester tidak boleh approve sendiri | UAT META → Invoice selesai |
| 4. Pengadaan | Kebutuhan project yang disetujui | Purchase Request dibuat, disetujui, lalu Purchase Order diterbitkan | Operations / Procurement | PR dan PO memiliki project, vendor, nilai, dan approval yang sah | UAT PR → PO selesai |
| 5. Pelaksanaan dan serah terima | PO, pekerjaan/barang | BAST Vendor dan BAST Customer dibuat dan diselesaikan | Operations / Project Owner | Kuantitas dan nilai tidak melebihi dokumen sumber; bukti serah terima tersedia | UAT BAST selesai |
| 6. Penagihan dan penerimaan | META/BAST/invoice source | Invoice dibuat, dikirim, payment schedule dipantau sampai paid | Finance | Invoice tidak ganda; status hanya melalui transisi sah; bukti pembayaran tercatat | UAT Invoice → Paid selesai |
| 7. Akuntansi dan laporan | Invoice, payment, cost | Jurnal otomatis, GL, AR/AP aging, cash flow, income statement, profitability | Finance | Debit-kredit balance; committed/paid/billed konsisten | Alur jurnal/payment teramati; evidence laporan dan profitability belum lengkap |
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
| Urutan approval | Manager → GM sesuai unit; Executive hanya jika ditugaskan matrix | Menunggu keputusan apakah manager saat ini boleh bermuara ke Executive |
| Syarat invoice | Hanya dari META/billing request approved dan sumber serah terima yang lengkap sesuai jenis transaksi | Menunggu Finance |
| Definisi profitability | Pisahkan committed, accrued/actual, paid, dan billed revenue | Menunggu Finance |
| Data UAT sebelum pilot | Pertahankan untuk audit atau arsipkan sesuai keputusan pemilik data | Menunggu keputusan |
| Rotasi/nonaktif akun UAT | Semua akun `codex_*`, maksimal 2 hari kerja setelah UAT/pilot ditutup | Menunggu penetapan System Admin dan Process Owner |
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
| S3 | Sales mengisi pipeline dan dokumen project | Status pipeline berubah sah; dokumen dapat di-upload/download; audit tercatat | Lulus — gate project selesai; upload, download, dan hapus dokumen berhasil diuji |
| S4 | Sales menandai dokumen lengkap | Project masuk ke gate Prodev; user tanpa hak tidak dapat mengubah gate | Lulus — stage maju ke Presales |
| S5 | Product & Development mengisi analisis dan BoQ | Hanya bagian yang berwenang yang dapat mengubah; histori BoQ tercatat | Lulus sebagian — BoQ `19`, seluruh status presales submitted, dan approval `50` selesai; histori/versioning BoQ serta pembatasan edit per bagian belum memiliki evidence lengkap |
| S6 | Role lintas departemen mencoba mengubah BoQ/presales | Backend menolak dengan `403` bila tidak memiliki scope/permission | Lulus — Sales mendapat `403` saat membuat BoQ |
| S7 | Project ditutup sebagai Won sesuai proses | Sales Order terbentuk otomatis; tidak ada pembuatan Sales Order manual ganda | Lulus — `SO-0036`, satu item BoQ |
| S8 | Sales menambahkan Customer PO | Customer PO terhubung ke Sales Order dan nilai tervalidasi | Lulus — Customer PO `5`, total `160.000.000` |
| S9 | User read-only mengakses seluruh alur | GET berhasil sesuai scope; POST/PUT/DELETE ditolak `403` | Lulus smoke test; uji endpoint-by-endpoint masih terbuka |
| S10 | Penolakan/invalid input | Nilai negatif, project/customer tidak sah, atau transisi status ilegal ditolak tanpa data parsial | Lulus — pipeline invalid ditolak `400`, project tetap `Closed/Win` |

UAT Sales/Presales berjalan pada project `622` dengan customer `92`. Approval
ProDev request `50` sudah disetujui oleh `codex_prodev_manager_uat`. Keempat
bagian presales sudah submitted dan approval harga request `51` sudah disetujui
oleh `codex_exec`. Project berhasil melalui Quotation → Win, membentuk `SO-0036`,
dan menerima Customer PO `5`.

UAT Operations/Finance berjalan terpisah pada project `610` / `PRJ-ITS-2026-0056`
dengan Sales Order `SO-0031`. Evidence-nya meliputi META `16`/`17`, approval
request `46`/`47`, PR `PR-0028`, PO `PO-0020`, approval `48`/`49`, BAST Vendor
`BASTV-0009`, BAST Customer `BASTC-0012`, Invoice `INV-0011`/`INV-0012`, payment
schedule `25`, dan jurnal `JE-0028` sampai `JE-0031`.

Approval harga request `51` bukan bypass teknis Executive: matrix yang digunakan adalah
`presales_price_approval` dengan tipe `requester_manager`, requester-nya
`codex_finance_uat`, dan manager yang terdaftar adalah `codex_exec`. Hal ini
tetap harus dikonfirmasi sebagai keputusan bisnis final. Pola manager yang
bermuara ke `codex_exec` berlaku lebih luas pada akun UAT dan menjadi penahan
keputusan rute approval, bukan sekadar catatan evidence.

Rangkaian project `610` dibuat sebelum aturan prefix pilot ditetapkan dan tidak
menggunakan prefix `UAT-` pada nomor dokumennya. Rangkaian tersebut harus
diperlakukan sebagai evidence UAT historis, bukan data pilot. Semua data pilot
baru wajib memakai prefix `PILOT-2026`.

Audit transaksi setelah rangkaian UAT menghasilkan `0 violations`. Audit
approval tambahan menemukan request legacy `34` (`META-0012`) tanpa step;
temuan ini belum didisposisikan. Selain disposition, perlu dibuktikan tanggal
pembuatan request `34` terhadap commit/tanggal penerapan fail-closed, agar dapat
dipastikan apakah ini data lama sebelum hardening atau indikasi celah aktif.

Restore upload staging juga menemukan dua metadata project `618` yang tidak
memiliki file fisik. Dua file hilang bertimestamp sekitar Agustus 2026,
sedangkan file yang masih ada bertimestamp 27 Oktober 2026. Pola ini konsisten
dengan hipotesis perubahan storage, tetapi belum membuktikan root cause.
Sebelum merge ke production, IT wajib menjalankan rekonsiliasi metadata-file
read-only di production dan melaporkan jumlah metadata, jumlah file fisik,
missing path, orphan file, serta rentang waktu upload. Restore archive yang
hanya berisi satu file juga belum membuktikan cakupan seluruh 468 project.

Backup offsite ditunda atas keputusan tim. Staging tetap dapat dipakai untuk
pengembangan dan UAT, tetapi belum boleh diperlakukan sebagai release
candidate atau sistem go-live sampai backup offsite dan uji restore-nya selesai.

Kriteria lulus tahap ini: seluruh skenario S1–S10 memiliki bukti screenshot/API
response, tidak ada data parsial, dan audit log dapat ditelusuri berdasarkan
user serta project UAT.

## Gate pilot dan release candidate

### Syarat masuk pilot terbatas

Staging boleh digunakan untuk persiapan pilot setelah Process Owner, peserta,
periode, approval baseline, data prefix, monitoring, dan risk acceptance backup
offsite disetujui. Syarat ini berbeda dari syarat release candidate.

### Syarat selesai pilot

Pilot selesai setelah seluruh skenario pilot memiliki evidence, tidak ada defect
Sev-1/Sev-2 terbuka, laporan direkonsiliasi, dan Process Owner menandatangani
hasilnya.

### Syarat release candidate

Staging belum dinyatakan release candidate sampai seluruh item berikut terpenuhi:

- [ ] Pemilik proses dan approver disahkan.
- [ ] Batas nominal dan pengecualian disetujui.
- [ ] UAT UI dan API untuk setiap role selesai.
- [ ] Alur normal dan minimal satu skenario penolakan/rollback diuji.
- [ ] Transaction integrity checks menghasilkan `0 violations` dan seluruh
      temuan approval legacy telah didisposisikan setelah UAT terakhir.
- [ ] Backup database dan upload lokal berhasil serta restore teruji.
- [ ] Backup offsite terenkripsi tersedia dan restore dari salinan offsite
      berhasil.
- [ ] Checklist pilot, monitoring, dan rollback disetujui.
- [ ] Seluruh akun `codex_*` dirotasi atau dinonaktifkan setelah UAT sesuai
      keputusan System Admin/Process Owner.
- [ ] Rekonsiliasi metadata-file staging dan production selesai tanpa temuan
      yang belum didisposisikan.

## Referensi

- [REVIEW_STAGING_2026-10-26.md](REVIEW_STAGING_2026-10-26.md)
- [STAGING_UAT_EVIDENCE_INDEX.md](STAGING_UAT_EVIDENCE_INDEX.md)
- [ROLE_PERMISSION_TEST_MATRIX_STAGING.md](ROLE_PERMISSION_TEST_MATRIX_STAGING.md)
- [ops/STAGING_STORAGE.md](ops/STAGING_STORAGE.md)
- [ops/UPLOAD_METADATA_RECONCILIATION.md](ops/UPLOAD_METADATA_RECONCILIATION.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
