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
| B1 | Lengkapi daftar akun actor UAT | **Terdokumentasi** | Daftar actor, role, division, manager, dan transaksi approval `46–49` ada di `STAGING_BUSINESS_PROCESS_SIGNOFF.md` dan `ROLE_PERMISSION_TEST_MATRIX_STAGING.md`. Password tidak boleh masuk evidence. |
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
| E2 | Persistensi perubahan ke Git | **Commit dokumentasi pending pada saat dokumen ini dibuat** | Setelah perubahan ini selesai, commit/push ke `origin/staging` dan catat hash serta hasil CI/CD. Secret `.env.staging` dan data runtime tetap tidak masuk Git. |
| E3 | Rotasi/nonaktif akun `codex_*_uat` | **Pending penetapan** | Rekomendasi: System Admin menonaktifkan atau merotasi maksimal 2 hari kerja setelah UAT/pilot ditutup; Process Owner menyetujui daftar akun dan tanggal. Akun dummy tidak boleh digunakan pada pilot operasional. |

## Keputusan yang menahan sign-off

Sign-off tetap **belum dapat diberikan** sampai minimal hal berikut selesai:

1. disposition request approval legacy `34` dan audit ulang;
2. rekonsiliasi metadata-file project `618`;
3. evidence S1–S10 dan export audit log;
4. live negative approval test dan read-only/cross-division evidence di
   environment yang aman;
5. bukti backup/restore diterima Process Owner;
6. Process Owner menyetujui approval matrix, nominal, rute approval harga,
   definisi laporan Finance, dan peserta pilot.

Backup offsite dan penetapan Process Owner tetap merupakan keputusan manajemen,
bukan sesuatu yang boleh diasumsikan oleh implementasi teknis.

## Referensi

- `STAGING_BUSINESS_PROCESS_SIGNOFF.md`
- `STAGING_UAT_EVIDENCE_INDEX.md`
- `STAGING_BACKUP_RESTORE_EVIDENCE_2026-10-28.md`
- `ROLE_PERMISSION_TEST_MATRIX_STAGING.md`
- `STAGING_PILOT_PLAN.md`
