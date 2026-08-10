package handlers

import (
	"context"
	"fmt"
	"time"

	"sales-system-backend/database"

	"github.com/jackc/pgx/v5"
)

// accountIDByCode: resolve chart_of_accounts.id dari account_code TETAP
// (kode seed Langkah 1) -- kalau akun ini dinonaktifkan Finance, lookup
// gagal dan seluruh operasi bisnis pemicu IKUT GAGAL (fail loud by design,
// bukan silent-skip, supaya buku tidak pernah diam-diam tidak sinkron).
func accountIDByCode(ctx context.Context, code string) (int64, error) {
	var id int64
	err := database.Pool.QueryRow(ctx, `
		SELECT id FROM chart_of_accounts WHERE account_code = $1 AND status = 'active'
	`, code).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("akun COA %s tidak ditemukan/tidak aktif: %w", code, err)
	}
	return id, nil
}

// hasJournalEntryForSource: cek idempotensi -- source_type dibuat PER-EVENT
// (bast_vendor/payment_schedule_paid/invoice_sent/invoice_paid), BUKAN
// per-entity, supaya 2 event pada entity yang sama (invoice sent lalu
// paid) masing-masing independen (lihat catatan desain di plan).
func hasJournalEntryForSource(ctx context.Context, sourceType string, sourceID int64) (bool, error) {
	var exists bool
	err := database.Pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM journal_entries WHERE source_type = $1 AND source_id = $2)
	`, sourceType, sourceID).Scan(&exists)
	return exists, err
}

// resolveProjectIDFromPO/resolveProjectIDFromInvoiceSO: BACA data yang
// sudah committed sebelumnya (PO/PR/SO/invoice tidak diubah dalam
// transaction yang sama) -- aman pakai database.Pool biasa, bukan tx.
func resolveProjectIDFromPO(ctx context.Context, poID int64) (int64, error) {
	var projectID int64
	err := database.Pool.QueryRow(ctx, `
		SELECT so.project_id
		FROM purchase_orders po
		JOIN purchase_requests pr ON pr.id = po.purchase_request_id
		JOIN sales_orders so ON so.id = pr.sales_order_id
		WHERE po.id = $1
	`, poID).Scan(&projectID)
	return projectID, err
}

func resolveProjectIDFromInvoiceSO(ctx context.Context, soID int64) (int64, error) {
	var projectID int64
	err := database.Pool.QueryRow(ctx, `SELECT project_id FROM sales_orders WHERE id = $1`, soID).Scan(&projectID)
	return projectID, err
}

// postBASTVendorJournal: Dr Harga Pokok Penjualan/Jasa (5000), Cr Utang
// Usaha (2000). Nilai = SUM(qty_received * unit_cost) HANYA utk item di
// BAST INI (bukan total PO) -- supaya BAST parsial tidak dobel-hitung.
func postBASTVendorJournal(ctx context.Context, tx pgx.Tx, bastID, poID, createdBy int64) error {
	already, err := hasJournalEntryForSource(ctx, "bast_vendor", bastID)
	if err != nil {
		return err
	}
	if already {
		return nil
	}

	var amount float64
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(bvi.qty_received * poi.unit_cost), 0)
		FROM bast_vendor_items bvi
		JOIN purchase_order_items poi ON poi.id = bvi.purchase_order_item_id
		WHERE bvi.bast_vendor_id = $1
	`, bastID).Scan(&amount)
	if err != nil {
		return err
	}
	if amount <= 0 {
		return nil
	}

	projectID, err := resolveProjectIDFromPO(ctx, poID)
	if err != nil {
		return err
	}

	cogsID, err := accountIDByCode(ctx, "5000")
	if err != nil {
		return err
	}
	apID, err := accountIDByCode(ctx, "2000")
	if err != nil {
		return err
	}

	lines := []journalLineInput{
		{AccountID: cogsID, ProjectID: &projectID, Debit: amount},
		{AccountID: apID, ProjectID: &projectID, Credit: amount},
	}
	sourceID := bastID
	_, _, err = insertJournalEntryTx(ctx, tx, "bast_vendor", &sourceID, time.Now(), fmt.Sprintf("Penerimaan barang/jasa vendor - BAST #%d", bastID), createdBy, lines)
	return err
}

// postPaymentSchedulePaidJournal: Dr Utang Usaha (2000), Cr rekening
// Kas/Bank yang dipilih (bankAccountID -- default "1100 Bank" kalau
// caller tidak pilih rekening spesifik, resolve+validasi di pemanggil).
func postPaymentSchedulePaidJournal(ctx context.Context, tx pgx.Tx, scheduleID, poID int64, amount float64, bankAccountID int64, createdBy int64) error {
	already, err := hasJournalEntryForSource(ctx, "payment_schedule_paid", scheduleID)
	if err != nil {
		return err
	}
	if already || amount <= 0 {
		return nil
	}

	projectID, err := resolveProjectIDFromPO(ctx, poID)
	if err != nil {
		return err
	}

	apID, err := accountIDByCode(ctx, "2000")
	if err != nil {
		return err
	}

	lines := []journalLineInput{
		{AccountID: apID, ProjectID: &projectID, Debit: amount},
		{AccountID: bankAccountID, ProjectID: &projectID, Credit: amount},
	}
	sourceID := scheduleID
	_, _, err = insertJournalEntryTx(ctx, tx, "payment_schedule_paid", &sourceID, time.Now(), fmt.Sprintf("Pembayaran termin vendor #%d", scheduleID), createdBy, lines)
	return err
}

// postInvoiceSentJournal: Dr Piutang Usaha (1200) = amount+tax; Cr
// Pendapatan Jasa/Penjualan (4000) = amount; Cr Utang Pajak (2100) = tax
// HANYA kalau tax_amount>0 (baris $0 melanggar CHECK constraint).
func postInvoiceSentJournal(ctx context.Context, tx pgx.Tx, invoiceID, soID int64, amount, taxAmount float64, createdBy int64) error {
	already, err := hasJournalEntryForSource(ctx, "invoice_sent", invoiceID)
	if err != nil {
		return err
	}
	total := amount + taxAmount
	if already || total <= 0 {
		return nil
	}

	projectID, err := resolveProjectIDFromInvoiceSO(ctx, soID)
	if err != nil {
		return err
	}

	arID, err := accountIDByCode(ctx, "1200")
	if err != nil {
		return err
	}
	revenueID, err := accountIDByCode(ctx, "4000")
	if err != nil {
		return err
	}

	lines := []journalLineInput{
		{AccountID: arID, ProjectID: &projectID, Debit: total},
	}
	if taxAmount > 0 {
		taxPayableID, err := accountIDByCode(ctx, "2100")
		if err != nil {
			return err
		}
		lines = append(lines,
			journalLineInput{AccountID: revenueID, ProjectID: &projectID, Credit: amount},
			journalLineInput{AccountID: taxPayableID, ProjectID: &projectID, Credit: taxAmount},
		)
	} else {
		lines = append(lines, journalLineInput{AccountID: revenueID, ProjectID: &projectID, Credit: amount})
	}

	sourceID := invoiceID
	_, _, err = insertJournalEntryTx(ctx, tx, "invoice_sent", &sourceID, time.Now(), fmt.Sprintf("Invoice terkirim #%d", invoiceID), createdBy, lines)
	return err
}

// postInvoicePaidJournal: Dr rekening Kas/Bank yang dipilih (bankAccountID
// -- default "1100 Bank" kalau caller tidak pilih rekening spesifik,
// resolve+validasi di pemanggil), Cr Piutang Usaha (1200) = total.
func postInvoicePaidJournal(ctx context.Context, tx pgx.Tx, invoiceID, soID int64, totalAmount float64, bankAccountID int64, createdBy int64) error {
	already, err := hasJournalEntryForSource(ctx, "invoice_paid", invoiceID)
	if err != nil {
		return err
	}
	if already || totalAmount <= 0 {
		return nil
	}

	projectID, err := resolveProjectIDFromInvoiceSO(ctx, soID)
	if err != nil {
		return err
	}

	arID, err := accountIDByCode(ctx, "1200")
	if err != nil {
		return err
	}

	lines := []journalLineInput{
		{AccountID: bankAccountID, ProjectID: &projectID, Debit: totalAmount},
		{AccountID: arID, ProjectID: &projectID, Credit: totalAmount},
	}
	sourceID := invoiceID
	_, _, err = insertJournalEntryTx(ctx, tx, "invoice_paid", &sourceID, time.Now(), fmt.Sprintf("Pelunasan invoice #%d", invoiceID), createdBy, lines)
	return err
}
