# Tindak Lanjut Review Business Analyst — Staging

Tanggal: 2026-10-28
Branch: `staging`
Status: **open — belum menjadi sign-off atau release candidate**

Dokumen ini memetakan review Business Analyst terhadap evidence yang tersedia.
Status **Lulus teknis** berarti kontrol di source code atau unit/contract test
sudah dapat diverifikasi; status tersebut tidak menggantikan bukti live staging,
bukti UAT, atau persetujuan Process Owner.

## A. Kontrol approval

| ID | Tindak lanjut | Status | Evidence/keputusan yang diperlukan |
|---|---|---|---|
| A1 | Uji negatif tanpa matrix, tanpa manager, dan tanpa approver | **Sebagian lulus** | Code path fail-closed dan unit test tersedia. Response HTTP `422` serta query before/after pada environment terisolasi masih harus dilampirkan. Tidak boleh menguji dengan transaksi staging aktif yang berisiko membuat data parsial. |
| A2 | Pastikan nominal dan approver tidak hardcoded | **Review source selesai; konfigurasi bisnis pending** | Handler `backend/handlers/approval.go` mengambil nilai dari `approval_matrices`; approver dinamis dari `manager_id` atau role matrix. Frontend `frontend/app/(app)/approval-matrices/page.tsx` hanya mengirim input admin. Migration `0005`, `0012`, dan `0033` berisi seed/konfigurasi yang terlihat dan harus disahkan sebagai konfigurasi, bukan dianggap bypass tersembunyi. |

Kontrol approval baru boleh disebut bersih setelah request legacy `34` /
`META-0012` yang berstatus `approved` tanpa step mendapat disposition tertulis
dari pemilik data, lalu audit approval dijalankan ulang.

## B. Akun, role, dan permission

| ID | Tindak lanjut | Status | Evidence/keputusan yang diperlukan |
|---|---|---|---|
| B1 | Lengkapi daftar akun actor UAT | **Terdokumentasi** | Daftar actor, role, division, manager, dan transaksi approval `46–51` ada di `STAGING_BUSINESS_PROCESS_SIGNOFF.md` dan `ROLE_PERMISSION_TEST_MATRIX_STAGING.md`. Password tidak boleh masuk evidence. Cakupan rotasi berlaku untuk semua akun `codex_*`. |
| B2 | Role & Permission Test Matrix lintas division | **Baseline tersedia; live evidence pending** | Matrix mencakup Sales, Product & Development, Operations, Procurement, Finance, Executive, System Admin, dan read-only. Per kombinasi endpoint/role yang dipakai pilot masih perlu response `403` dan audit log. |
| B3 | Read-only endpoint-by-endpoint untuk POST/PUT/DELETE | **Contract test lulus; live evidence pending** | `backend/middleware/read_only_test.go` mencakup kelas mutation route tanpa database. Uji live harus dilakukan pada dataset/mock terisolasi atau endpoint yang aman dan dilampiri status `403`; jangan mengandalkan smoke test saja. |

Approval `46–49` dan approval harga `51` sudah memiliki actor yang tercatat.
Untuk approval `51`, `codex_finance_uat` adalah requester dan `codex_exec` adalah
manager yang ditentukan `manager_id`; ini bukan bypass Executive. Penetapan ini
tetap perlu konfirmasi Process Owner sebagai kebijakan bisnis.

## C. Evidence UAT

| ID | Tindak lanjut | Status | Evidence/keputusan yang diperlukan |
|---|---|---|---|
| C1 | S5 histori/versioning BoQ project `622` | **Belum terbukti, bukan otomatis defect** | Fitur tersedia melalui migration `0031_document_versioning_boq_history.sql`, route `GET /api/projects/:id/boq-items/:itemId/history`, handler `ListBOQItemHistory`, dan snapshot saat update di `backend/handlers/boq_items.go`. Karena belum ada edit BoQ yang berhasil diuji, ulangi satu edit yang sah pada item pilot terisolasi lalu cek satu baris histori dan pembatasan edit. Jika edit sah tidak membuat histori, buka defect. |
| C2 | Lampiran screenshot/API S1–S10 dan export audit per user/project | **Belum lengkap** | Kumpulkan artefak terpisah, masked, bertanggal, berisi user/role, project, transaction ID, request/response, dan audit log. Index saat ini hanya mencatat ID dan status. |
| C3 | Prefix project `610` | **Dijelaskan** | Project `610` dan rangkaian Operations/Finance adalah evidence UAT historis tanpa prefix UAT eksplisit, bukan data pilot. Semua data pilot baru wajib memakai `PILOT-2026`. |

## D. Backup dan reproduksibilitas

| ID | Tindak lanjut | Status | Evidence/keputusan yang diperlukan |
|---|---|---|---|
| D1 | Log backup dan restore database/upload | **Teknis lulus; rekonsiliasi terbuka** | Backup/restore `2026-10-28` terdokumentasi. Restore database dan archive upload berhasil secara disposable, tetapi 2 dari 3 metadata dokumen project `618` tidak memiliki file pada archive. Jangan menghapus metadata atau mengubah data sebelum keputusan pemilik data. |
| D2 | Koreksi Pilot Plan | **Dikoreksi secara status** | Backup/restore script tersedia dan bukti eksekusi ada; namun entry/exit gate tetap tertahan sampai rekonsiliasi metadata-file selesai dan evidence diterima Process Owner. Backup offsite tetap ditunda dan wajib sebelum RC/go-live. |
| D3 | Reproduksibilitas dari repo | **Parsial** | Migration/schema/permission dan `.env.staging.example` tersedia tanpa secret. Assignment `manager_id`, akun UAT, dan matrix bisnis yang dibuat di database belum seluruhnya direkonstruksi dari database kosong. Sebelum RC, pilih dan uji bootstrap bersih yang versioned. |

## E. Dokumen dan akun

| ID | Tindak lanjut | Status | Evidence/keputusan yang diperlukan |
|---|---|---|---|
| E1 | Pisahkan gate pilot, pilot exit, dan RC | **Sudah dipisahkan** | `STAGING_PILOT_PLAN.md` dan `STAGING_BUSINESS_PROCESS_SIGNOFF.md` membedakan entry pilot, exit pilot, dan RC. Status “siap pilot” harus dibaca sebagai persiapan terbatas, bukan RC/go-live. |
| E2 | Persistensi perubahan ke Git | **Sudah dipersist pada `origin/staging`; CI/CD perlu diverifikasi** | Perubahan sebelumnya sudah dipush. Follow-up BA ini harus kembali di-commit/push dan hasil CI/CD dicatat. Secret `.env.staging` dan data runtime tetap tidak masuk Git. |
| E3 | Rotasi/nonaktif seluruh akun `codex_*` | **Pending penetapan** | Cakupan tidak boleh dibatasi suffix `_uat`. System Admin menonaktifkan atau merotasi seluruh akun `codex_*` maksimal 2 hari kerja setelah UAT/pilot ditutup; Process Owner menyetujui daftar akun dan tanggal. Akun dummy tidak boleh digunakan pada pilot operasional. |
| E4 | Rute manager yang bermuara ke Executive | **Pending keputusan manajemen** | Banyak manager UAT memiliki `codex_exec` sebagai `manager_id`, sehingga rule `requester_manager` mengarah ke Executive. Tentukan apakah ini kebijakan yang diinginkan atau ubah struktur/matrix sebelum RC. |
| E5 | Root cause approval legacy `34` | **Pending analisis waktu/commit** | Hardening fail-closed terdokumentasi pada commit `97dcb49` (`2026-10-28 15:04 WIB`). Cocokkan `created_at` request `34` dengan waktu tersebut dan deployment efektif. Disposition tanpa root cause tidak cukup untuk menutup kontrol. |
| E6 | Risiko storage ke production | **Pending pemeriksaan production** | Jalankan rekonsiliasi metadata-file read-only di production sebelum merge, mengikuti `ops/UPLOAD_METADATA_RECONCILIATION.md`. Laporkan missing path, orphan file, jumlah project yang tercakup, serta kesesuaian archive terhadap metadata. Tidak ada pemeriksaan production yang boleh dianggap selesai tanpa output bertanggal. |

## Keputusan yang menahan sign-off

Sign-off tetap **belum dapat diberikan** sampai minimal hal berikut selesai:

1. disposition dan root-cause request approval legacy `34`, lalu audit ulang;
2. rekonsiliasi metadata-file project `618` serta pemeriksaan risiko yang sama
   di production;
3. evidence S1–S10 dan export audit log;
4. live negative approval test dan read-only/cross-division evidence di
   environment yang aman;
5. bukti backup/restore diterima Process Owner;
6. satu edit BoQ yang sah menghasilkan histori dan pembatasan edit terbukti;
7. cakupan rotasi semua akun `codex_*` disepakati;
8. Process Owner menyetujui approval matrix, nominal, rute approval harga,
   definisi laporan Finance, dan peserta pilot.

Backup offsite dan penetapan Process Owner tetap merupakan keputusan manajemen,
bukan sesuatu yang boleh diasumsikan oleh implementasi teknis.

## Pembagian tindak lanjut

Untuk handoff, item 1–6 pada rekap BA dikirim ke developer/IT sebagai pekerjaan
teknis dan evidence. Item 7–9 dibawa ke manajemen: rute approval Executive,
Process Owner/nominal/definisi Finance/peserta pilot, dan keputusan backup
offsite. Pembagian ini tidak mengubah fakta bahwa seluruh item penahan di atas
harus selesai sebelum RC.

## Referensi

- `STAGING_BUSINESS_PROCESS_SIGNOFF.md`
- `STAGING_UAT_EVIDENCE_INDEX.md`
- `STAGING_BACKUP_RESTORE_EVIDENCE_2026-10-28.md`
- `ROLE_PERMISSION_TEST_MATRIX_STAGING.md`
- `STAGING_PILOT_PLAN.md`
