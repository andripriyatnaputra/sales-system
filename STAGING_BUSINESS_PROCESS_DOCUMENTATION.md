# Dokumentasi Proses Bisnis Mini ERP — Handoff Business Analyst

Tanggal: 2026-10-28  
Branch: `staging`  
Status: **baseline proses untuk review Business Analyst dan persiapan pilot terbatas**

## 1. Tujuan dan ruang lingkup

Dokumen ini menjelaskan proses bisnis Mini ERP yang sedang dikembangkan pada
branch `staging`, mulai dari pengelolaan customer dan sales sampai penagihan,
pembayaran, akuntansi, dan laporan profitability.

Dokumen ini disiapkan sebagai bahan untuk:

- deck presentasi Business Analyst kepada pemilik proses dan manajemen;
- konfirmasi alur, peran, approval matrix, dan batas nominal;
- penyusunan skenario pilot terbatas;
- pencatatan gap antara proses bisnis yang disepakati dan perilaku aplikasi.

Dokumen ini **belum merupakan SOP final** dan belum menjadi persetujuan
go-live. Aturan nominal, nama Process Owner, dan pengecualian bisnis tetap harus
disahkan oleh pemilik proses.

## 2. Status saat ini

### 2.1 Status teknis staging

- Branch yang digunakan: `staging`.
- CI/CD staging terakhir berhasil: build, test, typecheck, deploy SSH, dan
  health check.
- Backend health/readiness dan frontend staging telah diverifikasi.
- Baseline role, approval, audit integrity, migration, dan penyimpanan dokumen
  telah diuji pada staging; live read-only endpoint-by-endpoint dan cross-
  division evidence masih pending.
- Perubahan belum digabungkan ke `main`/production.
- Runbook backup database/upload lokal dan restore test tersedia; eksekusi
  terakhir berhasil secara teknis, tetapi rekonsiliasi metadata-file masih
  terbuka karena dua file yang direferensikan database tidak ada di archive.
- Backup offsite masih ditunda dan wajib diselesaikan sebelum release candidate
  atau go-live.

### 2.2 Status bisnis

Secara teknis, alur utama sudah tersedia untuk UAT/pilot terbatas. Namun,
status **siap digunakan secara operasional** masih menunggu:

1. penetapan Process Owner tiap area;
2. pengesahan approval matrix dan batas nominal;
3. konfirmasi definisi laporan keuangan dan profitability;
4. persetujuan peserta dan periode pilot;
5. hasil pilot tanpa defect Sev-1/Sev-2 yang terbuka.

Perbedaan penting: **UAT teknis lulus bukan berarti proses bisnis sudah
disahkan untuk go-live**.

## 3. Peta proses end-to-end

```text
Lead / Customer
      |
      v
Project & Pipeline
      |
      v
Presales / Analisis Solusi / BoQ / Harga
      |
      v
Approval Manager / Executive sesuai Matrix
      |
      v
Quotation -> Win -> Sales Order -> Customer PO
      |
      v
META / Billing Request
      |
      +------------------------------+
      |                              |
      v                              v
Purchase Request -> Approval -> PO   Billing / Invoice Request
      |                              |
      v                              v
BAST Vendor / BAST Customer       Invoice -> Payment
      |                              |
      +---------------+--------------+
                      v
             Jurnal / GL / AR-AP
                      |
                      v
      Cash Flow / Income Statement / Profitability
                      |
                      v
          Executive Dashboard & Audit Review
```

Setiap tahap harus memiliki project, owner, division, dokumen sumber, dan
status yang dapat ditelusuri. Status tidak boleh diubah secara langsung di
database sebagai prosedur operasional.

### Istilah kunci

| Istilah | Makna dalam proses |
|---|---|
| BoQ | Bill of Quantity; rincian item, kuantitas, dan nilai kebutuhan solusi/project |
| META | Dokumen/request internal untuk kesiapan pelaksanaan dan/atau penagihan project |
| PR | Purchase Request; permintaan pengadaan dari kebutuhan project |
| PO | Purchase Order; pesanan resmi kepada vendor setelah PR disetujui |
| Customer PO | Pesanan resmi dari customer yang menjadi dasar komersial project |
| BAST | Berita Acara Serah Terima untuk vendor atau customer |
| GL | General Ledger; buku besar/jurnal akuntansi |
| AR/AP | Account Receivable / Account Payable; piutang customer dan kewajiban kepada vendor |

## 4. Rangkaian proses dan kontrol bisnis

| Tahap | Aktivitas utama | Output utama | Pemilik proses yang direkomendasikan | Gate/kontrol wajib | Status staging |
|---|---|---|---|---|---|
| 1. Lead, customer, dan project | Membuat atau memilih customer, membuat project, menetapkan owner, division, dan pipeline | Customer, project, pipeline | Sales | Cegah duplikasi customer; project wajib punya owner dan division | UAT teknis lulus; perlu konfirmasi BA |
| 2. Presales dan analisis solusi | Mengumpulkan kebutuhan, membuat analisis solusi, item katalog, BoQ, versi dan histori | Analisis solusi, BoQ, estimasi biaya | Product & Development / Sales | Scope, quantity, harga, margin, dan versi tercatat | UAT teknis lulus; perlu validasi isi bisnis |
| 3. Approval presales dan harga | Mengirim BoQ/harga untuk approval sesuai unit dan matrix | Approval request dan keputusan | Manager requester / Executive bila ditugaskan | Requester tidak boleh approve sendiri; tidak ada auto-approve fallback | UAT teknis lulus; limit nominal menunggu pengesahan |
| 4. Quotation dan Sales Order | Mengubah project yang disetujui menjadi quotation, menandai Win, dan membentuk Sales Order | Quotation, status Win, Sales Order | Sales Manager | Hanya project yang memenuhi gate yang dapat menjadi order; cegah order ganda | UAT lulus: `SO-0036` |
| 5. Customer PO | Mencatat PO customer yang terkait Sales Order | Customer PO dan nilai order | Sales | Project, Sales Order, nilai, dan dokumen sumber harus konsisten | UAT lulus: Customer PO `5` |
| 6. META / billing request | Mengajukan kebutuhan pelaksanaan dan rencana penagihan | META/billing request | Project Owner / Sales / Finance | Approval aktif; requester tidak boleh menyetujui sendiri | UAT alur selesai; perlu sign-off Finance |
| 7. Pengadaan | Membuat PR dari kebutuhan project, approval, vendor, dan PO | PR, approval PR, Purchase Order | Operations / Procurement | Project, vendor, nilai, dan approval sah; nilai tidak melebihi sumber | UAT alur selesai; perlu konfirmasi limit |
| 8. Pelaksanaan dan serah terima | Mencatat pelaksanaan, penerimaan barang/jasa, BAST vendor dan customer | BAST Vendor, BAST Customer | Operations / Project Owner | Kuantitas dan nilai sesuai dokumen sumber; bukti serah terima tersedia | UAT alur selesai |
| 9. Invoice dan payment | Membuat invoice dari sumber yang approved, mengatur termin, mencatat pembayaran | Invoice, payment schedule, status paid | Finance | Invoice tidak ganda; sumber dan transisi status sah; bukti pembayaran tersedia | UAT alur selesai; perlu sign-off Finance |
| 10. Akuntansi | Membentuk jurnal dan memperbarui GL berdasarkan transaksi | Jurnal, GL, AR/AP | Finance | Debit-kredit balance; audit trail lengkap | UAT alur selesai; perlu rekonsiliasi bisnis |
| 11. Laporan dan monitoring | Meninjau cash flow, income statement, AR/AP aging, profitability, dashboard, dan audit log | Laporan manajemen dan work queue | Finance / Executive / System Admin | Angka dapat direkonsiliasi ke transaksi sumber; read-only tidak dapat menulis | UAT teknis lulus; perlu sign-off laporan |

## 5. Peran dan tanggung jawab

| Peran | Tanggung jawab proses | Batasan penting |
|---|---|---|
| Sales Staff | Customer, project, pipeline, dokumen, dan aktivitas sales sesuai scope | Tidak boleh melewati approval atau mengubah data di luar division |
| Sales Manager | Review aktivitas sales, approval yang ditugaskan, dan validasi customer/project | Tidak boleh menyetujui request yang dibuat sendiri |
| Product & Development Staff | Analisis solusi, item, BoQ, dan revisi presales | Tidak mengubah transaksi di luar scope ProDev |
| Product & Development Manager | Review dan approval BoQ/presales sesuai matrix | Approval harus berasal dari assignment yang sah |
| Operations Staff/Manager/GM | PR, pelaksanaan, BAST, dan approval Operations sesuai level | Approval berjenjang mengikuti matrix; tidak boleh self-approval |
| Procurement | Vendor, PO, termin, dan koordinasi pengadaan | PO harus memiliki sumber kebutuhan dan approval |
| Finance | Billing request, invoice, payment, jurnal, rekonsiliasi, dan laporan | Invoice/payment tidak boleh dibuat tanpa sumber yang sah |
| Executive | Dashboard, laporan, dan approval yang secara eksplisit ditugaskan | Tidak diasumsikan memiliki bypass write |
| System Admin/IT | User, role, approval matrix, audit log, monitoring, dan support | Tidak menggunakan akses admin untuk menggantikan approval bisnis |
| Process Owner | Menetapkan aturan, menerima hasil pilot, dan menyetujui perubahan proses | Keputusan harus terdokumentasi dan dapat diaudit |

## 6. Prinsip approval dan segregasi tugas

Baseline yang direkomendasikan untuk dikonfirmasi:

1. Approval ditentukan oleh division, jenis transaksi, nilai, dan level
   organisasi; bukan hardcode di frontend.
2. Manager requester menjadi approver pertama bila ditentukan matrix.
3. GM atau Executive hanya terlibat bila threshold atau matrix memang
   mensyaratkannya.
4. Requester tidak dapat menyetujui request miliknya sendiri.
5. Tidak ada approval otomatis hanya karena approver atau threshold belum
   ditemukan.
6. Setiap keputusan approval menyimpan actor, waktu, status, komentar, dan
   referensi transaksi.
7. User read-only dapat membaca sesuai scope, tetapi seluruh operasi write
   ditolak oleh backend dengan `403`.
8. Perubahan user, role, approval, transaksi, status, dan dokumen harus dapat
   ditelusuri melalui audit log.

## 7. Bukti UAT yang telah tersedia

UAT end-to-end telah menghasilkan bukti teknis berikut pada data dummy staging:

- Customer `92`.
- Project `622` / `PRJ-ITS-2026-0060`.
- BoQ `19`.
- Approval ProDev `50`.
- Approval harga `51`.
- Sales Order `SO-0036`.
- Customer PO `5` dengan total `160.000.000`.
- Project berhasil melalui alur Quotation sampai Win.
- Invalid input ditolak dengan `400` tanpa data parsial.
- User read-only dapat membaca dan operasi write ditolak dengan `403`.
- Transaction integrity checks terakhir menghasilkan `0 violations`; audit
  approval menemukan satu request legacy tanpa step dan masih terbuka.
- Upload, download, dan penghapusan dokumen telah diuji berhasil setelah
  perbaikan CSRF/configuration.

Data tersebut adalah evidence UAT, bukan data operasional production. Selama
pilot, seluruh data baru harus memakai prefix `PILOT-2026` atau label setara.

### 7.1 Pemisahan evidence UAT

Evidence UAT tidak seluruhnya berada pada project `622`. Terdapat dua rangkaian
UAT yang sengaja dipisahkan:

| Rangkaian | Project | Bukti utama | Relasi |
|---|---:|---|---|
| Sales/Presales | `622` / `PRJ-ITS-2026-0060` | Customer `92`, BoQ `19`, approval ProDev `50`, approval harga `51`, Sales Order `SO-0036`, Customer PO `5` | Satu alur Sales sampai Customer PO |
| Operations/Finance | `610` / `PRJ-ITS-2026-0056` | Sales Order `SO-0031`, META `META-0016`/`16`, META `META-0017`/`17`, PR `PR-0028`, PO `PO-0020`, BAST Vendor `BASTV-0009`, BAST Customer `BASTC-0012`, Invoice `INV-0011`/`11` dan `INV-0012`/`12` | Satu alur Operations/Finance yang terhubung ke Sales Order `31` |

Dengan demikian, jawaban atas pertanyaan apakah seluruh evidence terhubung ke
project `622` adalah **tidak**. Evidence Operations/Finance terhubung ke project
`610`. Kedua project tetap merupakan data dummy staging dan tidak saling
dianggap sebagai satu transaksi pilot.

Detail status rangkaian Operations/Finance:

- META `16` disetujui melalui approval request `46` dan menghasilkan `INV-0011`
  berstatus `draft`.
- META `17` disetujui melalui approval request `47` dan menghasilkan `INV-0012`
  berstatus `paid`.
- PR `28` (`PR-0028`) disetujui melalui approval request `48`.
- PO `20` (`PO-0020`) disetujui melalui approval request `49`.
- Payment schedule `25` untuk PO vendor `20` berstatus `paid`.
- Jurnal terkait yang terbentuk antara lain `JE-0028` sampai `JE-0031`, dan
  masing-masing hasil pemeriksaan debit-kredit seimbang.

### 7.2 Gap evidence yang masih terbuka

- Lampiran screenshot/API response S1-S10 belum dikumpulkan sebagai folder
  evidence formal.
- Audit log per user dan project belum dilampirkan sebagai export evidence.
- S5 belum membuktikan histori/versioning BoQ dan pengujian pembatasan edit
  per bagian secara lengkap. Data saat ini menunjukkan BoQ dan approval lulus,
  tetapi histori BoQ untuk project `622` masih `0` baris. Ini adalah gap bukti,
  bukan defect yang sudah dibuka.
- S9 baru merupakan smoke test read-only. Belum ada evidence endpoint-by-endpoint
  untuk seluruh operasi POST/PUT/DELETE.
- Audit approval menemukan satu request legacy `34` (`META-0012`, project `610`)
  berstatus approved tanpa approval step. Request UAT terbaru memiliki step yang
  sesuai, tetapi data legacy ini perlu root-cause berdasarkan waktu/commit dan
  disposition sebelum klaim integritas approval dinyatakan bersih.
- Bukti eksekusi backup lokal dan restore database/upload tersedia di index
  evidence, tetapi belum dapat dinyatakan lengkap sampai dua file metadata
  project `618` direkonsiliasi dengan volume. Karena archive hanya memulihkan
  satu file dari 468 project, cakupan backup upload juga belum terbukti.
- Risiko kehilangan file dapat merembet ke production. Sebelum merge, IT wajib
  menjalankan rekonsiliasi metadata-file production secara read-only dan
  menyimpan output jumlah metadata, file fisik, missing path, orphan file, dan
  rentang waktu upload.

## 8. Kebutuhan pilot terbatas

### 8.1 Tujuan

Pilot digunakan untuk memastikan bahwa alur kerja, istilah, pembagian tugas,
approval, dan laporan dapat digunakan oleh pemilik proses dalam skenario yang
mendekati pekerjaan sehari-hari. Pilot bukan cutover production.

### 8.2 Rekomendasi peserta

- Sales Staff dan Sales Manager.
- Product & Development Staff dan Manager.
- Operations Staff/Manager/GM.
- Procurement.
- Finance.
- Executive sebagai reviewer dashboard/laporan.
- System Admin/IT sebagai support dan observer audit.

Nama peserta, akun, dan periode harus disetujui oleh masing-masing Process
Owner. Akun dummy UAT hanya digunakan untuk pengujian; password tidak boleh
dimasukkan ke Git atau deck. Semua akun yang diawali `codex_`, termasuk yang
tidak memiliki suffix `_uat`, tidak digunakan sebagai akun operasional pilot.
Pilot harus memakai akun individual dengan role minimum yang ditetapkan Process
Owner. Setelah UAT/pilot selesai, seluruh akun `codex_*` harus dirotasi atau
dinonaktifkan sesuai keputusan pemilik sistem.

### 8.3 Skenario minimum

| ID | Skenario pilot | Bukti yang dikumpulkan |
|---|---|---|
| P1 | Customer -> Project -> pipeline | ID customer/project, owner, division, status |
| P2 | Analisis solusi -> BoQ -> approval manager | Versi BoQ, nilai, approval, komentar |
| P3 | Quotation -> Win -> Sales Order -> Customer PO | Nomor dokumen, nilai, relasi antar dokumen |
| P4 | META/billing request -> approval | Request, approver, keputusan, timestamp |
| P5 | PR -> approval -> PO -> payment schedule | PR/PO, vendor, nilai, approval |
| P6 | BAST Vendor dan BAST Customer | Kuantitas, dokumen bukti, status selesai |
| P7 | Invoice -> payment -> jurnal | Invoice, termin, payment, jurnal, status |
| P8 | Dashboard, AR/AP, profitability, dan laporan keuangan | Screenshot/export dan rekonsiliasi angka |
| P9 | Upload, download, expiry, dan delete dokumen | Bukti akses per role dan audit log |
| P10 | Read-only dan invalid input | Response `403`/`400`, tidak ada data parsial |

### 8.4 Aturan pelaksanaan

1. Gunakan prefix `PILOT-2026` pada customer/project/transaksi pilot.
2. Jangan mengubah production atau approval pending existing.
3. Gunakan UI sebagai jalur utama; API hanya untuk verifikasi bukti.
4. Catat waktu, user, project, halaman/endpoint, hasil aktual, dan screenshot
   setiap skenario.
5. Jangan menghapus data pilot sebelum Process Owner menyetujui keputusan
   retensi.
6. Defect diklasifikasikan minimal sebagai Sev-1 (bencana/kehilangan data),
   Sev-2 (alur bisnis utama terhenti), Sev-3 (fungsi minor/workaround), atau
   Sev-4 (kosmetik/dokumentasi).

### 8.5 Gate masuk pilot

Pilot baru boleh dimulai setelah seluruh item berikut disetujui:

- scope, peserta, periode, dan Process Owner telah ditetapkan;
- approval matrix baseline dan pengecualian selama pilot telah disetujui;
- data pilot, prefix `PILOT-2026`, dan aturan non-production telah disepakati;
- akun individual pilot sudah tersedia; akun dummy UAT tidak dipakai sebagai
  akun operasional;
- monitoring, jalur eskalasi, dan defect log telah disiapkan;
- backup lokal dan risk acceptance backup offsite telah dicatat.

### 8.6 Kriteria sukses dan exit pilot

Pilot dapat direkomendasikan selesai apabila:

- semua skenario minimum memiliki bukti dan hasil yang dapat diterima;
- tidak ada defect Sev-1/Sev-2 terbuka;
- Process Owner menyetujui alur dan pembagian tanggung jawab;
- approval matrix dan pengecualian bisnis telah disahkan;
- angka invoice, payment, jurnal, AR/AP, dan profitability dapat direkonsiliasi;
- transaction integrity checks tetap menghasilkan `0 violations` dan tidak ada
  temuan approval legacy yang belum didisposisikan;
- backup lokal dan restore teruji;
- keputusan retensi/arsip data pilot telah dibuat;
- risiko backup offsite telah ditutup atau diterima secara formal untuk tahap
  yang jelas.

## 9. Output yang perlu dibuat Business Analyst

### 9.1 Rekomendasi struktur deck

1. Latar belakang dan tujuan Mini ERP.
2. Batasan scope staging dan alasan belum merge ke production.
3. Peta proses end-to-end dari sales sampai laporan keuangan.
4. Peran, tanggung jawab, dan segregasi tugas.
5. Approval matrix dan kebutuhan batas nominal.
6. Contoh alur transaksi pilot dan dokumen yang dihasilkan.
7. Status UAT serta bukti teknis yang sudah tersedia.
8. Rencana pilot, peserta, periode, dan cara pencatatan defect.
9. Kriteria sukses, exit criteria, dan risiko.
10. Keputusan yang diminta dari Process Owner/manajemen.

### 9.2 Artefak pilot

- daftar peserta dan role;
- daftar customer/project/transaksi pilot;
- script skenario P1-P10;
- template bukti hasil dan defect log;
- matriks approval final;
- definisi laporan dan rekonsiliasi yang disepakati Finance;
- daftar kontak support dan jalur eskalasi;
- form sign-off tiap Process Owner;
- keputusan retensi atau arsip data pilot.

## 10. Keputusan bisnis yang masih terbuka

| Keputusan | Rekomendasi awal | Pemilik keputusan | Status |
|---|---|---|---|
| Process Owner tiap tahap | Mengikuti pemetaan pada bagian 4 | Manajemen/Head tiap area | Pending |
| Batas nominal approval | Dikelola melalui Approval Matrix, tidak hardcode | Manajemen/Finance | Pending |
| Urutan approval | Manager -> GM sesuai unit; Executive hanya jika ditugaskan matrix | Manajemen | Pending |
| Syarat invoice | Sumber approved dan bukti serah terima lengkap sesuai jenis transaksi | Finance | Pending |
| Definisi profitability | Pisahkan committed, accrued/actual, paid, dan billed revenue | Finance | Pending |
| Durasi pilot | Rekomendasi 5-10 hari kerja setelah seluruh peserta siap | Process Owner | Pending |
| Retensi data pilot | Pertahankan sebagai evidence selama pilot, lalu arsipkan dengan persetujuan | Pemilik data/IT | Pending |
| Rotasi/nonaktif akun UAT | Maksimal 2 hari kerja setelah pilot/UAT ditutup; System Admin sebagai pelaksana dan Process Owner sebagai pemberi persetujuan | System Admin/Process Owner | Pending |
| Backup offsite | Private encrypted storage, versioning, dan restore test | IT/Manajemen | Ditunda; wajib sebelum RC/go-live |
| Keputusan setelah pilot | Lanjut hardening, release candidate, atau perbaikan ulang | Steering Committee | Pending |

## 11. Referensi

- [Staging Business Process Sign-off](STAGING_BUSINESS_PROCESS_SIGNOFF.md)
- [Index Evidence UAT Staging](STAGING_UAT_EVIDENCE_INDEX.md)
- [Evidence Backup dan Restore Staging](STAGING_BACKUP_RESTORE_EVIDENCE_2026-10-28.md)
- [Staging Pilot Plan](STAGING_PILOT_PLAN.md)
- [Role & Permission Test Matrix](ROLE_PERMISSION_TEST_MATRIX_STAGING.md)
- [Staging Storage Runbook](ops/STAGING_STORAGE.md)
- [Deployment Runbook](DEPLOYMENT.md)

---

**Kesimpulan:** staging saat ini sudah cukup sebagai baseline demonstrasi,
UAT, dan pilot terbatas. Staging belum boleh diposisikan sebagai sistem
operasional final sampai keputusan bisnis, sign-off Process Owner, backup
offsite, dan exit criteria pilot terpenuhi.
