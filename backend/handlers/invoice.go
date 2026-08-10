package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// CreateInvoice: Finance only. Hanya bisa dibuat dari META yang statusnya
// SUDAH 'approved' (gate, mirror CreatePurchaseOrder). Amount di-copy dari
// billing_request, tidak diinput ulang -- Finance cuma tambah tax/tanggal.
func CreateInvoice(c *gin.Context) {
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa membuat Invoice"})
		return
	}

	var body struct {
		BillingRequestID int64   `json:"billing_request_id"`
		TaxAmount        float64 `json:"tax_amount"`
		IssueDate        string  `json:"issue_date"`
		DueDate          string  `json:"due_date"`
		Notes            string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.BillingRequestID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "billing_request_id wajib diisi"})
		return
	}

	var brStatus string
	var salesOrderID int64
	var amount float64
	if err := database.Pool.QueryRow(c, `
		SELECT status, sales_order_id, amount FROM billing_requests WHERE id = $1
	`, body.BillingRequestID).Scan(&brStatus, &salesOrderID, &amount); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "billing_request (META) tidak ditemukan"})
		return
	}
	if brStatus != "approved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "META belum approved (status saat ini: " + brStatus + ")"})
		return
	}

	var invID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO invoices (invoice_number, billing_request_id, sales_order_id, amount, tax_amount, created_by, issue_date, due_date, notes)
		VALUES ('', $1, $2, $3, $4, $5, NULLIF($6,'')::date, NULLIF($7,'')::date, NULLIF($8, ''))
		RETURNING id
	`, body.BillingRequestID, salesOrderID, amount, body.TaxAmount, c.GetInt64("user_id"), body.IssueDate, body.DueDate, body.Notes).Scan(&invID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	invoiceNumber := fmt.Sprintf("INV-%04d", invID)
	_, err = database.Pool.Exec(c, `UPDATE invoices SET invoice_number = $1 WHERE id = $2`, invoiceNumber, invID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "invoice", strconv.FormatInt(invID, 10), invoiceNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": invID, "invoice_number": invoiceNumber})
}

func scanInvoice(row interface{ Scan(...interface{}) error }) (*models.Invoice, error) {
	var inv models.Invoice
	var brApprovedAt *time.Time
	err := row.Scan(&inv.ID, &inv.InvoiceNumber, &inv.BillingRequestID, &inv.METANumber, &inv.SalesOrderID, &inv.SONumber,
		&inv.CustomerName, &inv.Amount, &inv.TaxAmount, &inv.Status, &inv.IsOverdue, &inv.IssueDate, &inv.DueDate,
		&inv.SentAt, &inv.PaidAt, &inv.CreatedBy, &inv.CreatedByUsername, &inv.Notes, &inv.CreatedAt, &inv.UpdatedAt,
		&brApprovedAt)
	if err != nil {
		return nil, err
	}
	inv.TotalAmount = inv.Amount + inv.TaxAmount
	inv.IssuanceAgingDays = daysBetween(brApprovedAt, &inv.CreatedAt)
	return &inv, nil
}

const invoiceSelectBase = `
	SELECT inv.id, inv.invoice_number, inv.billing_request_id, br.meta_number, inv.sales_order_id, so.so_number,
	       COALESCE(cu.name, ''), inv.amount, inv.tax_amount, inv.status,
	       COALESCE(inv.status = 'sent' AND inv.due_date < NOW(), false) AS is_overdue,
	       inv.issue_date, inv.due_date, inv.sent_at, inv.paid_at, inv.created_by, COALESCE(u.username, ''),
	       inv.notes, inv.created_at, inv.updated_at, br.approved_at
	FROM invoices inv
	JOIN billing_requests br ON br.id = inv.billing_request_id
	JOIN sales_orders so ON so.id = inv.sales_order_id
	LEFT JOIN customers cu ON cu.id = so.customer_id
	LEFT JOIN users u ON u.id = inv.created_by
`

func ListInvoices(c *gin.Context) {
	status := c.Query("status")
	query := invoiceSelectBase
	args := []interface{}{}
	if status != "" {
		query += " WHERE inv.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY inv.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.Invoice{}
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err == nil {
			list = append(list, *inv)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetInvoice(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, invoiceSelectBase+" WHERE inv.id = $1", id)
	inv, err := scanInvoice(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}

	c.JSON(http.StatusOK, inv)
}

// UpdateInvoiceStatus: transisi manual draft/sent/paid/cancelled oleh Finance
// -- sent_at/paid_at otomatis terisi sesuai transisi (mirror pola paid_at di
// UpdatePaymentSchedule).
// invoiceAllowedTransitions: transisi status TERURUT wajib (draft->sent->paid),
// izinkan resubmit status SAMA sebagai no-op, tolak lompatan (mis. draft->paid
// langsung) -- BARU ditambah Fase 3 Langkah 3, karena auto-posting butuh
// urutan pasti (draft->paid langsung akan mem-posting kredit Piutang Usaha
// yang tidak pernah di-debit lewat event 'sent', bikin saldo AR salah).
var invoiceAllowedTransitions = map[string]map[string]bool{
	"draft":     {"draft": true, "sent": true, "cancelled": true},
	"sent":      {"sent": true, "paid": true, "cancelled": true},
	"paid":      {"paid": true},
	"cancelled": {"cancelled": true},
}

func UpdateInvoiceStatus(c *gin.Context) {
	id := c.Param("id")
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa mengubah status Invoice"})
		return
	}

	var body struct {
		Status        string `json:"status"`
		BankAccountID *int64 `json:"bank_account_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "draft" && body.Status != "sent" && body.Status != "paid" && body.Status != "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	ctx := c.Request.Context()
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	var oldStatus string
	var amount, taxAmount float64
	var salesOrderID int64
	if err := tx.QueryRow(ctx, `
		SELECT status, amount, tax_amount, sales_order_id FROM invoices WHERE id = $1 FOR UPDATE
	`, id).Scan(&oldStatus, &amount, &taxAmount, &salesOrderID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}

	if !invoiceAllowedTransitions[oldStatus][body.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("transisi status invoice dari '%s' ke '%s' tidak diizinkan", oldStatus, body.Status)})
		return
	}

	var sentAtClause, paidAtClause interface{}
	if body.Status == "sent" {
		sentAtClause = "now"
	}
	if body.Status == "paid" {
		paidAtClause = "now"
	}

	_, err = tx.Exec(ctx, `
		UPDATE invoices
		SET status = $1,
		    sent_at = CASE WHEN $2::text = 'now' THEN NOW() ELSE sent_at END,
		    paid_at = CASE WHEN $3::text = 'now' THEN NOW() ELSE paid_at END,
		    updated_at = NOW()
		WHERE id = $4
	`, body.Status, sentAtClause, paidAtClause, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	invoiceID, _ := strconv.ParseInt(id, 10, 64)
	if body.Status == "sent" && oldStatus != "sent" {
		if err := postInvoiceSentJournal(ctx, tx, invoiceID, salesOrderID, amount, taxAmount, c.GetInt64("user_id")); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal posting jurnal GL: " + err.Error()})
			return
		}
	}
	if body.Status == "paid" && oldStatus != "paid" {
		var bankAccountID int64
		if body.BankAccountID != nil {
			bankAccountID = *body.BankAccountID
		} else {
			bankAccountID, err = accountIDByCode(ctx, "1100")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
		if ok, cerr := isCashEquivalentAccount(ctx, bankAccountID); cerr != nil || !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bank_account_id bukan akun Kas/Bank yang valid"})
			return
		}
		if ok, msg := validateLedgerAccount(ctx, bankAccountID); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		if err := postInvoicePaidJournal(ctx, tx, invoiceID, salesOrderID, amount+taxAmount, bankAccountID, c.GetInt64("user_id")); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal posting jurnal GL: " + err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "invoice", id, body.Status, body)

	// Auto-advance Post-PO Monitoring Stage 5 (Invoice Submission) begitu
	// invoice terkirim ke customer -- "sent", BUKAN "paid" (paid = pembayaran
	// diterima, konsep beda dari submission). Efek samping best-effort.
	if body.Status == "sent" {
		maybeAdvancePostPOStage(ctx, salesOrderID, 5, "Done", c.GetInt64("user_id"))
	}

	c.JSON(http.StatusOK, gin.H{"status": body.Status})
}
