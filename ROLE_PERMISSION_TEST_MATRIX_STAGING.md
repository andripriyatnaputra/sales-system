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

UAT Finance juga selesai: termin `25` menjadi `paid`, Invoice `INV-0012`
bertransisi `draft → sent → paid`, jurnal otomatis untuk pembayaran termin dan
Invoice terbentuk dengan debit-kredit seimbang, dan endpoint profitability,
AR/AP aging, journal entries, serta executive dashboard merespons `200`.
Profitability project UAT terhitung committed `80.000.000`, actual paid
`80.000.000`, dan billed revenue `141.350.000`.

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

## Export akun dan permission yang dipakai evidence UAT — 2026-10-28

| Akun | Role/level | Division/scope | Manager | Permission eksplisit |
|---|---|---|---|---|
| `codex_ops_staff` | Implementations Staff | Operations / Implementations | `codex_ops_manager` | - |
| `codex_ops_manager` | Implementations Manager | Operations / Implementations | `codex_ops_gm` | - |
| `codex_ops_gm` | Operations GM | Operations | `codex_exec` | - |
| `codex_procurement_manager` | Procurement Manager | Procurement | `codex_exec` | `vendors.manage` |
| `codex_finance_manager` | Finance Manager | Finance | `codex_exec` | - |
| `codex_finance_uat` | Finance Staff | Finance | `codex_exec` | - |
| `codex_exec` | Executive | Lintas departemen | - | - |
| `codex_sales_staff_uat` | IT Solutions Staff | Sales / IT Solutions | `codex_sales_manager_uat` | `sales_orders.manage` |
| `codex_sales_manager_uat` | IT Solutions Manager | Sales / IT Solutions | `codex_exec` | `sales_orders.manage` |
| `codex_prodev_staff_uat` | Network Solutions Staff | Product & Development | `codex_prodev_manager_uat` | - |
| `codex_prodev_manager_uat` | Network Solutions Manager | Product & Development | `codex_exec` | - |
| `codex_sales_readonly_uat` | IT Solutions Staff, read-only | Sales / IT Solutions | - | `sales_orders.manage` pada role, tetapi seluruh write diblokir oleh `read_only` |
| `admin` | System Admin | Lintas departemen | - | `approval.matrix.manage`, `audit.view`, `roles.manage`, `sales_orders.manage`, `users.manage`, `vendors.manage` |

Daftar ini membedakan akun yang benar-benar menjadi actor evidence dari akun
yang hanya diprovisioning untuk UAT. `codex_ops_uat`,
`codex_ops_unassigned`, dan `codex_procurement_uat` tersedia tetapi belum
menjadi actor pada evidence utama.

## Matriks kontrol lintas division

| Area/endpoint | Pemilik write | Expected lintas division | Bukti/status |
|---|---|---|---|
| Customer/project core | Sales atau System Admin | Role non-Sales ditolak `403` untuk write di luar scope | Code gate + UAT Sales; perlu evidence per role |
| Presales ProDev/BoQ | Product & Development | Sales/Operations/Procurement/Finance ditolak `403` untuk field ProDev | Sales mendapat `403` saat membuat BoQ; coverage role lain masih perlu dilampirkan |
| Presales Operations | Operations | Departemen lain ditolak `403` | Code gate `requireDepartment`; live evidence belum lengkap |
| Presales Procurement | Procurement | Departemen lain ditolak `403` | Code gate `requireDepartment`; live evidence belum lengkap |
| Presales Finance/harga | Finance | Departemen lain ditolak `403` | Code gate `requireDepartment`; live evidence belum lengkap |
| PR/BAST/META | Operations | Non-Operations ditolak `403` untuk write | Code gate + UAT Operations; evidence endpoint belum lengkap |
| PO/vendor | Procurement | Non-Procurement ditolak `403` untuk write | Code gate/permission; evidence endpoint belum lengkap |
| Invoice/GL/COA/cost | Finance | Non-Finance ditolak `403` untuk write | Code gate; evidence endpoint belum lengkap |
| Approval matrix/user/role/audit | System Admin | Non-System Admin ditolak `403` | `RequirePermission` dan unit test; live matrix belum lengkap |
| Executive | Baca + approval yang ditugaskan | Business mutation ditolak `403`; approval assigned diperbolehkan | Unit test `executive_read_only_test.go`; live endpoint evidence belum lengkap |

## Lokasi kontrol di kode

- Middleware global read-only: `backend/routes/routes.go` pada protected group
  dan `backend/middleware/read_only.go`. Semua route protected melewati kontrol
  ini; GET/HEAD/OPTIONS tetap read-only, method lain ditolak untuk akun
  `read_only`.
- Executive write guard: `backend/middleware/executive_read_only.go`; hanya
  keputusan approval pada route yang ditugaskan yang menjadi pengecualian.
- Permission claims: `backend/middleware/permission.go` dan
  `backend/middleware/jwt.go`.
- Department gates: `backend/handlers/presales.go`,
  `purchase_request.go`, `purchase_order.go`, `billing_request.go`,
  `invoice.go`, `bast_vendor.go`, `bast_customer.go`, `coa.go`, dan
  `journal_entry.go`.
- Matrix dan approval resolution: `backend/handlers/approval.go` dan
  `backend/handlers/approval_matrix.go`; nominal dan approver diambil dari
  tabel `approval_matrices`, bukan dari nilai hidden di frontend.

Contract test `backend/middleware/read_only_test.go` sekarang mencakup seluruh
kelas mutation protected route tanpa menyentuh database. Coverage live
endpoint-by-endpoint untuk akun read-only dan seluruh kombinasi lintas division
masih merupakan evidence yang harus dilengkapi sebelum sign-off. Unit test
middleware membuktikan guard global, tetapi tidak menggantikan evidence request
aktual per endpoint.
