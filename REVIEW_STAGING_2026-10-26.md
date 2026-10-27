# Review Branch Staging

Tanggal review: 2026-10-26

## Kesimpulan

Branch `staging` sudah memiliki cakupan Mini ERP yang luas, mulai dari project sales, presales/BoQ, Sales Order, Purchase Request/Order, BAST, META, invoice, General Ledger, laporan keuangan, profitability, timesheet, approval, audit, dokumen, dan work request. Namun branch ini belum siap dianggap sebagai ERP operasional yang aman.

## Temuan prioritas

1. Belum ada migration runner, migration versioning, atau step migration pada deployment. Terdapat banyak file SQL, tetapi database kosong tidak otomatis disiapkan.
2. Approval untuk PR, PO, META, dan approval harga belum memiliki matrix bisnis final. Fallback saat ini dapat membuat submission otomatis `approved` tanpa approval manusia.
3. Autentikasi masih berisiko: password ditulis ke log, JWT secret di-hardcode, claim JWT menggunakan type assertion yang dapat panic, dan token tidak direvoke saat user dihapus/nonaktif.
4. File upload tersimpan di filesystem lokal dan belum terlihat memiliki persistent volume/backup pada deployment staging.
5. Validasi kuantitas BAST, PR, PO, pembayaran, dan jumlah kumulatif belum cukup untuk mencegah over-delivery, nilai negatif, atau pembayaran tidak valid.
6. Sejumlah workflow belum atomik, terutama BAST Customer, invoice creation, dan beberapa proses approval.
7. Approval engine belum aman terhadap race condition karena proses membaca pending step dan update status belum memakai locking/conditional update.
8. Satu META dapat berpotensi menghasilkan lebih dari satu invoice karena tidak ada aturan unique/partial billing yang eksplisit.
9. Budget belum terhubung sebagai budget control terhadap PR/PO/actual cost; masih dominan sebagai monitoring.
10. Definisi cost pada profitability belum sepenuhnya dikunci antara committed, accrued, paid, dan actual cost.
11. Branch `staging` tertinggal dari `main`; beberapa fix production terbaru belum masuk ke staging.
12. Belum ada migration integration test, end-to-end test, permission test, dan concurrency test yang berarti.

## Prioritas lanjutan

Sinkronisasi branch, formalize migration, perbaiki security, tetapkan approval matrix dan struktur manager, amankan storage dokumen, tambahkan transaction/locking dan validasi kuantitas, lalu kunci aturan accounting sebelum menambah modul baru.
