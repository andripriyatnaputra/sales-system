# Index Evidence UAT Staging

Tanggal: 2026-10-28  
Status: **index internal; lampiran screenshot/API dan export audit belum lengkap**

Dokumen ini memisahkan evidence yang sudah dapat diidentifikasi dari evidence
yang masih harus dikumpulkan. Dokumen ini bukan pengganti screenshot, response
API, atau sign-off Process Owner.

## 1. Evidence transaksi yang sudah teridentifikasi

### 1.1 Rangkaian Sales/Presales — project 622

| Artefak | ID/nomor | Relasi |
|---|---|---|
| Customer | `92` | Customer untuk project `622` |
| Project | `622` / `PRJ-ITS-2026-0060` | Pipeline Closed / Win |
| BoQ | `19` | Satu item UAT, project `622` |
| Approval ProDev | `50` | Presales ProDev submission, approved |
| Approval harga | `51` | Presales price approval, approved |
| Sales Order | `SO-0036` | Project `622`, total `160.000.000` |
| Customer PO | `5` | Terhubung ke `SO-0036`, total `160.000.000` |

### 1.2 Rangkaian Operations/Finance — project 610

| Artefak | ID/nomor | Status/relasi |
|---|---|---|
| Project | `610` / `PRJ-ITS-2026-0056` | Sales Order `SO-0031` |
| META | `16` / `META-0016` | Approved via approval request `46`; invoice `INV-0011` draft |
| META | `17` / `META-0017` | Approved via approval request `47`; invoice `INV-0012` paid |
| PR | `28` / `PR-0028` | Approved via approval request `48` |
| PO | `20` / `PO-0020` | Approved via approval request `49` |
| BAST Vendor | `9` / `BASTV-0009` | Complete; terhubung ke PO `20` |
| BAST Customer | `12` / `BASTC-0012` | Complete; terhubung ke SO `31` |
| Payment schedule | `25` | Vendor PO `20`, status paid |
| Invoice | `11` / `INV-0011` | Draft |
| Invoice | `12` / `INV-0012` | Paid; billing request `17`, SO `31` |
| Jurnal | `JE-0028` s.d. `JE-0031` | Debit-kredit seimbang pada pemeriksaan UAT |

Rangkaian Operations/Finance tidak terhubung ke project `622`; seluruh artefak
di bagian ini terhubung ke project `610` melalui Sales Order `SO-0031`.

## 2. Status evidence skenario S1-S10

| ID | Skenario | Status evidence | Yang masih perlu dilampirkan |
|---|---|---|---|
| S1 | Customer baru | ID customer `92` tersedia | Screenshot/API response dan audit log |
| S2 | Customer -> Project | Project `622` tersedia | Screenshot/API response dan audit log |
| S3 | Pipeline dan dokumen | Upload, download, dan hapus sudah dicoba berhasil | Screenshot/API response dan audit log dokumen |
| S4 | Gate dokumen ke ProDev | Project maju ke Presales | Bukti status transition dan audit log |
| S5 | Analisis/BoQ/approval | BoQ `19`, approval `50`; status presales project `622` approved | Bukti histori/versioning dan pembatasan edit per bagian |
| S6 | Role lintas departemen | Sales mendapat `403` saat mencoba membuat BoQ | Response lengkap dan audit log penolakan |
| S7 | Quotation -> Win -> SO | `SO-0036` tersedia | Screenshot/API response dan audit log |
| S8 | Customer PO | PO `5` tersedia | Screenshot/API response dan audit log |
| S9 | Read-only | Smoke test GET/WRITE lulus | Uji endpoint-by-endpoint POST/PUT/DELETE |
| S10 | Invalid/rejection | Invalid pipeline mendapat `400`; tidak ada data parsial | Response lengkap, before/after query, dan audit log |

## 3. Evidence kontrol dan operasi

### 3.1 Negative approval control

Code path di `backend/handlers/approval.go` sudah fail-closed:

- no matching matrix -> `ErrApprovalMatrixNotConfigured`, HTTP `422`;
- requester tanpa manager -> `ErrApprovalManagerRequired`, HTTP `422`;
- role approver tanpa user aktif non-read-only ->
  `ErrApprovalApproverUnavailable`, HTTP `422`;
- validasi seluruh rule dan approver terjadi sebelum transaksi
  `approval_requests`/`approval_steps` dibuat.

Unit test untuk mapping policy error tersedia di
`backend/handlers/approval_policy_test.go`. Response live dan query before/after
untuk tiga skenario negatif tersebut masih harus dilampirkan sebagai evidence
staging sebelum sign-off.

Audit approval terbaru menemukan satu data legacy yang harus dianalisis dan
didisposisikan:
approval request `34` (`META-0012`, project `610`) berstatus `approved` tetapi
memiliki `0` step. Sepuluh approval approved lainnya memiliki step yang
approved, dan satu approval pending memiliki step pending. Temuan `34` tidak
dibuat oleh UAT terbaru dan tidak boleh diubah tanpa keputusan pemilik data;
namun temuan ini menahan klaim bahwa seluruh data historis sudah bebas dari
auto-approval. Sebelum ditutup, `created_at` request harus dibandingkan dengan
commit/tanggal penerapan fail-closed untuk membuktikan root cause. Hardening
fail-closed terdokumentasi pada commit `97dcb49` (`2026-10-28 15:04 WIB`), tetapi
waktu deployment efektif dan `created_at` request `34` masih harus dicocokkan.

### 3.2 Pemeriksaan hardcode approval

- `backend/handlers/approval.go` mengambil `min_amount`, `max_amount`,
  `step_order`, `approver_type`, dan `approver_role_id` dari tabel
  `approval_matrices`.
- `backend/handlers/approval_matrix.go` hanya memvalidasi format dan level role;
  tidak menentukan nominal atau approver bisnis.
- `frontend/app/(app)/approval-matrices/page.tsx` mengirim nilai yang dipilih
  System Admin; placeholder nominal hanya contoh input, bukan policy runtime.
- `backend/handlers/presales.go` menetapkan entity type dan department Finance
  sebagai routing proses, tetapi approver tetap di-resolve dari matrix dan
  `manager_id`.
- Migration `0012`, `0033`, dan `0005` berisi seed/placeholder konfigurasi
  historis. Itu adalah konfigurasi database yang terlihat dan diaudit, bukan
  bypass tersembunyi di handler/frontend. Sebelum RC, seed/threshold bisnis
  tetap harus disahkan dan diverifikasi terhadap matrix staging.

### 3.3 Reproduksibilitas konfigurasi

- `.env.staging.example` tersedia di repo dan tidak berisi secret deployment.
- Schema/RBAC baseline dan konfigurasi approval memiliki sumber SQL di
  `backend/database/migrations`, termasuk `0002_rbac_seed.sql`,
  `0012_approval_requester_manager.sql`, `0033_presales_prodev_manager_approval.sql`,
  dan `0037_approval_matrix_permissions.sql`.
- Deployment staging saat ini bukan clean-room bootstrap. Server menggunakan
  baseline database restore lalu menjalankan daftar migration staging eksplisit
  pada `.github/workflows/ci.yml`.
- Assignment `users.manager_id`, akun UAT, serta matrix bisnis yang dibuat atau
  disesuaikan melalui admin UI/database bukan seluruhnya direkonstruksi dari
  repo. Karena itu reproduksibilitas saat ini **parsial**, bukan bukti bahwa
  database kosong dapat dibangun identik.
- Sebelum RC, perlu dipilih dan diuji satu prosedur bootstrap bersih: restore
  baseline yang versioned + seluruh migration yang tervalidasi + seed role/
  permission/matrix yang disahkan, atau migration runner penuh dari database
  kosong.

| Kontrol | Status | Evidence yang diperlukan |
|---|---|---|
| Transaction integrity | `0 violations` pada pemeriksaan terakhir | File output/query bertanggal |
| Approval integrity | **1 legacy violation**: request `34` approved tanpa step | Root cause berdasarkan `created_at` vs commit fail-closed, disposition pemilik data, dan audit ulang |
| Health/readiness | Lulus pada deployment CI | Log job atau output health check |
| Backup database | Lulus eksekusi `2026-10-28 19:34 WIB` | `salesdb_staging_20261028_193448.sql.gz`, checksum, log |
| Backup upload | Lulus eksekusi `2026-10-28 19:34 WIB` | `uploads_20261028_193448.tar.gz`, checksum, log |
| Restore database | Lulus test disposable `2026-10-28 19:35 WIB` | SQL restore tanpa error; users 39, customers 85, projects 468 |
| Restore upload | Lulus test disposable `2026-10-28 19:35 WIB` | Archive dapat dipulihkan; 1 file terextract |
| Rekonsiliasi metadata-file | **Gagal / terbuka** | Database mereferensikan 3 dokumen project `618`, archive hanya berisi 1 file PDF; 2 file DOC/DOCX tidak ada di archive. Cakupan archive juga belum merepresentasikan 468 project |
| Backup offsite | Ditunda | Risk acceptance atau bukti backup offsite sebelum RC/go-live |

Log lengkap backup, restore, dan temuan rekonsiliasi tersedia di
[STAGING_BACKUP_RESTORE_EVIDENCE_2026-10-28.md](STAGING_BACKUP_RESTORE_EVIDENCE_2026-10-28.md).

Rangkaian project `610` tidak memakai prefix UAT eksplisit. Itu adalah evidence
UAT historis, bukan data pilot. Prefix `PILOT-2026` wajib digunakan untuk data
pilot baru.

Risiko storage tidak dibatasi ke staging. Sebelum merge ke production, IT wajib
menjalankan rekonsiliasi read-only metadata-file pada production dengan output
bertanggal yang mencakup jumlah metadata, file fisik, missing path, orphan file,
dan cakupan seluruh project. Tidak ada hasil production yang tersedia dalam
index ini saat ini.

## 4. Aturan evidence

- Jangan menyimpan password, JWT secret, cookie, atau isi `.env` dalam evidence.
- Masking username/email dapat dilakukan bila evidence dibagikan ke pihak luas.
- Setiap screenshot/API response harus memuat waktu, role/user, project, dan
  nomor transaksi yang relevan.
- Evidence read-only harus dibedakan antara response `200` untuk GET dan
  response `403` untuk operasi write.
- UAT dummy dan pilot tidak boleh diperlakukan sebagai data production.

## 5. Keputusan sign-off

Sign-off tidak boleh dianggap lengkap hanya berdasarkan adanya ID transaksi.
Business Analyst dan Process Owner tetap perlu memeriksa alur, bukti layar/API,
approval actor, audit trail, dan rekonsiliasi laporan.
