package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// CreatePurchaseOrder: Procurement only. Hanya bisa dibuat dari Purchase Request
// yang statusnya SUDAH 'approved' (gate). Item PO WAJIB dipilih dari
// purchase_request_items (traceability BoQ -> SO -> PR -> PO, bukan input bebas).
func CreatePurchaseOrder(c *gin.Context) {
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa membuat Purchase Order"})
		return
	}

	var body struct {
		PurchaseRequestID int64  `json:"purchase_request_id"`
		VendorID          int64  `json:"vendor_id"`
		Notes             string `json:"notes"`
		Items             []struct {
			PurchaseRequestItemID int64    `json:"purchase_request_item_id"`
			Qty                   *float64 `json:"qty"`
			UnitCost              float64  `json:"unit_cost"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.PurchaseRequestID == 0 || body.VendorID == 0 || len(body.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_request_id, vendor_id, dan items wajib diisi"})
		return
	}

	var prStatus string
	if err := database.Pool.QueryRow(c, `SELECT status FROM purchase_requests WHERE id = $1`, body.PurchaseRequestID).Scan(&prStatus); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_request tidak ditemukan"})
		return
	}
	if prStatus != "approved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_request belum approved (status saat ini: " + prStatus + ")"})
		return
	}

	var vendorStatus string
	if err := database.Pool.QueryRow(c, `SELECT status FROM vendors WHERE id = $1`, body.VendorID).Scan(&vendorStatus); err != nil || vendorStatus != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vendor tidak ditemukan atau tidak aktif"})
		return
	}

	var poID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO purchase_orders (po_number, purchase_request_id, vendor_id, created_by, notes)
		VALUES ('', $1, $2, $3, NULLIF($4, ''))
		RETURNING id
	`, body.PurchaseRequestID, body.VendorID, c.GetInt64("user_id"), body.Notes).Scan(&poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	poNumber := fmt.Sprintf("PO-%04d", poID)
	total := 0.0

	for _, it := range body.Items {
		var pri models.PurchaseRequestItem
		err := database.Pool.QueryRow(c, `
			SELECT id, purchase_request_id, item_name, unit, qty FROM purchase_request_items
			WHERE id = $1 AND purchase_request_id = $2
		`, it.PurchaseRequestItemID, body.PurchaseRequestID).Scan(&pri.ID, &pri.PurchaseRequestID, &pri.ItemName, &pri.Unit, &pri.Qty)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("purchase_request_item_id %d tidak ditemukan di PR ini", it.PurchaseRequestItemID)})
			return
		}

		qty := pri.Qty
		if it.Qty != nil && *it.Qty > 0 {
			qty = *it.Qty
		}

		_, err = database.Pool.Exec(c, `
			INSERT INTO purchase_order_items (purchase_order_id, purchase_request_item_id, item_name, unit, qty, unit_cost)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, poID, pri.ID, pri.ItemName, pri.Unit, qty, it.UnitCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		total += it.UnitCost * qty
	}

	_, err = database.Pool.Exec(c, `UPDATE purchase_orders SET po_number = $1, total_value = $2 WHERE id = $3`, poNumber, total, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "purchase_order", strconv.FormatInt(poID, 10), poNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": poID, "po_number": poNumber, "total_value": total})
}

func scanPurchaseOrder(row interface{ Scan(...interface{}) error }) (*models.PurchaseOrder, error) {
	var po models.PurchaseOrder
	err := row.Scan(&po.ID, &po.PONumber, &po.PurchaseRequestID, &po.PRNumber, &po.PRApprovedAt, &po.VendorID, &po.VendorName,
		&po.CreatedBy, &po.Status, &po.TotalValue, &po.ApprovalRequestID, &po.Notes, &po.ApprovedAt, &po.CreatedAt, &po.UpdatedAt)
	if err != nil {
		return &po, err
	}
	po.POCreationAgingDays = daysBetween(po.PRApprovedAt, &po.CreatedAt)
	return &po, nil
}

const purchaseOrderSelectBase = `
	SELECT po.id, po.po_number, po.purchase_request_id, pr.pr_number, pr.approved_at, po.vendor_id, v.name,
	       po.created_by, po.status, po.total_value, po.approval_request_id, po.notes, po.approved_at, po.created_at, po.updated_at
	FROM purchase_orders po
	JOIN purchase_requests pr ON pr.id = po.purchase_request_id
	JOIN vendors v ON v.id = po.vendor_id
`

func queryPurchaseOrderItems(c *gin.Context, poID int64) []models.PurchaseOrderItem {
	rows, err := database.Pool.Query(c, `
		SELECT id, purchase_order_id, purchase_request_item_id, item_name, unit, qty, unit_cost, created_at, updated_at
		FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id
	`, poID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	items := []models.PurchaseOrderItem{}
	for rows.Next() {
		var it models.PurchaseOrderItem
		if err := rows.Scan(&it.ID, &it.PurchaseOrderID, &it.PurchaseRequestItemID, &it.ItemName, &it.Unit, &it.Qty, &it.UnitCost, &it.CreatedAt, &it.UpdatedAt); err == nil {
			items = append(items, it)
		}
	}
	return items
}

func queryPaymentSchedules(c *gin.Context, parentType string, parentID int64) []models.PaymentSchedule {
	rows, err := database.Pool.Query(c, `
		SELECT id, parent_type, parent_id, sequence, trigger_description, percentage, amount, status, due_date, paid_at,
		       COALESCE(proof_file_name, ''),
		       CASE WHEN status <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
		            THEN (CURRENT_DATE - due_date)::int ELSE 0 END AS days_overdue,
		       created_at, updated_at
		FROM payment_schedules WHERE parent_type = $1 AND parent_id = $2 ORDER BY sequence
	`, parentType, parentID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	list := []models.PaymentSchedule{}
	for rows.Next() {
		var ps models.PaymentSchedule
		if err := rows.Scan(&ps.ID, &ps.ParentType, &ps.ParentID, &ps.Sequence, &ps.TriggerDescription, &ps.Percentage,
			&ps.Amount, &ps.Status, &ps.DueDate, &ps.PaidAt, &ps.ProofFileName, &ps.DaysOverdue, &ps.CreatedAt, &ps.UpdatedAt); err == nil {
			list = append(list, ps)
		}
	}
	return list
}

func ListPurchaseOrders(c *gin.Context) {
	status := c.Query("status")
	query := purchaseOrderSelectBase
	args := []interface{}{}
	if status != "" {
		query += " WHERE po.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY po.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.PurchaseOrder{}
	for rows.Next() {
		po, err := scanPurchaseOrder(rows)
		if err == nil {
			list = append(list, *po)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetPurchaseOrder(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, purchaseOrderSelectBase+" WHERE po.id = $1", id)
	po, err := scanPurchaseOrder(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase order not found"})
		return
	}

	if po.Status == "pending_approval" && po.ApprovalRequestID != nil {
		outcome, err := resolveApprovalOutcome(c, *po.ApprovalRequestID)
		if err == nil && outcome != "" {
			now := time.Now()
			_, _ = database.Pool.Exec(c, `
				UPDATE purchase_orders SET status = $1,
				       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN $3 ELSE approved_at END,
				       updated_at = NOW()
				WHERE id = $2
			`, outcome, po.ID, now)
			po.Status = outcome
			if outcome == "approved" && po.ApprovedAt == nil {
				po.ApprovedAt = &now
			}
		}
	}

	po.Items = queryPurchaseOrderItems(c, po.ID)
	po.PaymentSchedules = queryPaymentSchedules(c, "vendor_po", po.ID)
	c.JSON(http.StatusOK, po)
}

// SubmitPurchaseOrder: draft -> pending_approval, submit ke Approval Engine.
func SubmitPurchaseOrder(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa submit Purchase Order"})
		return
	}

	row := database.Pool.QueryRow(c, purchaseOrderSelectBase+" WHERE po.id = $1", id)
	po, err := scanPurchaseOrder(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase order not found"})
		return
	}
	if po.Status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hanya PO berstatus draft yang bisa disubmit (status saat ini: " + po.Status + ")"})
		return
	}

	deptID, _ := departmentIDByName(c, "Procurement")
	label := po.PONumber
	ar, err := SubmitForApproval(c, "purchase_order", strconv.FormatInt(id, 10), &label, &po.TotalValue, deptID, c.GetInt64("user_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newStatus := "pending_approval"
	if ar.Status == "approved" {
		newStatus = "approved"
	}
	_, err = database.Pool.Exec(c, `
		UPDATE purchase_orders SET status = $1, approval_request_id = $2,
		       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
		       updated_at = NOW()
		WHERE id = $3
	`, newStatus, ar.ID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "submit", "purchase_order", strconv.FormatInt(id, 10), po.PONumber, gin.H{"approval_request_id": ar.ID, "status": newStatus})

	c.JSON(http.StatusOK, gin.H{"status": newStatus, "approval_request_id": ar.ID})
}

// ===== Payment Schedules (termin), menempel ke PO (parent_type='vendor_po') =====

func CreatePaymentSchedule(c *gin.Context) {
	poID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid purchase order id"})
		return
	}
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa mengatur termin pembayaran"})
		return
	}

	var body struct {
		Sequence           int      `json:"sequence"`
		TriggerDescription *string  `json:"trigger_description"`
		Percentage         *float64 `json:"percentage"`
		Amount             float64  `json:"amount"`
		DueDate            *string  `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Sequence == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sequence wajib diisi"})
		return
	}

	var id int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO payment_schedules (parent_type, parent_id, sequence, trigger_description, percentage, amount, due_date)
		VALUES ('vendor_po', $1, $2, $3, $4, $5, $6::date)
		RETURNING id
	`, poID, body.Sequence, body.TriggerDescription, body.Percentage, body.Amount, body.DueDate).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "payment_schedule", strconv.FormatInt(id, 10), "", body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdatePaymentSchedule(c *gin.Context) {
	scheduleID := c.Param("scheduleId")
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa mengubah termin pembayaran"})
		return
	}

	var body struct {
		TriggerDescription *string  `json:"trigger_description"`
		Percentage         *float64 `json:"percentage"`
		Amount             *float64 `json:"amount"`
		DueDate            *string  `json:"due_date"`
		Status             *string  `json:"status"`
		BankAccountID      *int64   `json:"bank_account_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != nil && *body.Status != "pending" && *body.Status != "due" && *body.Status != "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	var paidAtClause interface{}
	if body.Status != nil && *body.Status == "paid" {
		paidAtClause = "now"
	}

	ctx := c.Request.Context()
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	var oldStatus, parentType string
	var parentID int64
	var oldAmount float64
	if err := tx.QueryRow(ctx, `
		SELECT status, parent_type, parent_id, amount FROM payment_schedules WHERE id = $1 FOR UPDATE
	`, scheduleID).Scan(&oldStatus, &parentType, &parentID, &oldAmount); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment schedule tidak ditemukan"})
		return
	}
	finalAmount := oldAmount
	if body.Amount != nil {
		finalAmount = *body.Amount
	}

	_, err = tx.Exec(ctx, `
		UPDATE payment_schedules
		SET trigger_description = COALESCE($1, trigger_description),
		    percentage = COALESCE($2, percentage),
		    amount = COALESCE($3, amount),
		    due_date = COALESCE($4::date, due_date),
		    status = COALESCE($5, status),
		    paid_at = CASE WHEN $6::text = 'now' THEN NOW() ELSE paid_at END,
		    updated_at = NOW()
		WHERE id = $7
	`, body.TriggerDescription, body.Percentage, body.Amount, body.DueDate, body.Status, paidAtClause, scheduleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newlyPaid := body.Status != nil && *body.Status == "paid" && oldStatus != "paid" && parentType == "vendor_po"
	if newlyPaid {
		id, err := strconv.ParseInt(scheduleID, 10, 64)
		if err == nil {
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
			if err := postPaymentSchedulePaidJournal(ctx, tx, id, parentID, finalAmount, bankAccountID, c.GetInt64("user_id")); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal posting jurnal GL: " + err.Error()})
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "payment_schedule", scheduleID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func DeletePaymentSchedule(c *gin.Context) {
	scheduleID := c.Param("scheduleId")
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa menghapus termin pembayaran"})
		return
	}

	result, err := database.Pool.Exec(c, `DELETE FROM payment_schedules WHERE id = $1`, scheduleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment schedule not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "payment_schedule", scheduleID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// UploadPaymentProof: Procurement only, sama gate dgn UpdatePaymentSchedule.
// Tidak memblokir/terkait "Tandai Lunas" -- dua aksi independen, reuse
// helper upload yang sudah ada (project_documents.go, package sama).
func UploadPaymentProof(c *gin.Context) {
	poID := c.Param("id")
	scheduleID := c.Param("scheduleId")
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa upload bukti pembayaran"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file wajib diisi"})
		return
	}
	if fileHeader.Size > maxDocumentSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ukuran file maksimal 10MB"})
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedDocumentExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tipe file tidak didukung"})
		return
	}

	destDir := filepath.Join(uploadBaseDir(), "purchase-orders", poID, "payment-proofs", scheduleID)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyiapkan folder upload"})
		return
	}

	storedName := fmt.Sprintf("%d_%s%s", time.Now().Unix(), randomHex(8), ext)
	destPath := filepath.Join(destDir, storedName)
	if err := c.SaveUploadedFile(fileHeader, destPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan file"})
		return
	}

	relativePath := filepath.Join("purchase-orders", poID, "payment-proofs", scheduleID, storedName)

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE payment_schedules SET proof_file_name = $1, proof_file_path = $2, proof_file_size = $3
		WHERE id = $4
	`, fileHeader.Filename, relativePath, fileHeader.Size, scheduleID)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		_ = os.Remove(destPath)
		c.JSON(http.StatusNotFound, gin.H{"error": "payment schedule not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "upload", "payment_proof", scheduleID, fileHeader.Filename, nil)

	c.JSON(http.StatusCreated, gin.H{"file_name": fileHeader.Filename})
}

// DownloadPaymentProof: read terbuka, sama prinsip GetPurchaseOrder.
func DownloadPaymentProof(c *gin.Context) {
	scheduleID := c.Param("scheduleId")

	var fileName, filePath string
	err := database.Pool.QueryRow(c, `
		SELECT proof_file_name, proof_file_path FROM payment_schedules WHERE id = $1
	`, scheduleID).Scan(&fileName, &filePath)
	if err != nil || filePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "bukti pembayaran tidak ditemukan"})
		return
	}

	fullPath := filepath.Join(uploadBaseDir(), filePath)
	c.FileAttachment(fullPath, fileName)
}

// ListAllPaymentSchedules: AP Aging lintas-PO -- satu-satunya endpoint yang
// menampilkan termin dari SEMUA purchase order sekaligus (GetPurchaseOrder
// cuma per-PO). Read terbuka. days_overdue dihitung, bukan disimpan.
func ListAllPaymentSchedules(c *gin.Context) {
	status := c.Query("status")

	query := `
		SELECT ps.id, ps.parent_id, po.po_number, v.name, ps.sequence, ps.amount, ps.status,
		       ps.due_date, COALESCE(ps.proof_file_name,''),
		       CASE WHEN ps.status <> 'paid' AND ps.due_date IS NOT NULL AND ps.due_date < CURRENT_DATE
		            THEN (CURRENT_DATE - ps.due_date)::int ELSE 0 END AS days_overdue
		FROM payment_schedules ps
		JOIN purchase_orders po ON po.id = ps.parent_id
		JOIN vendors v ON v.id = po.vendor_id
		WHERE ps.parent_type = 'vendor_po'
	`
	args := []interface{}{}
	if status != "" {
		query += " AND ps.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY days_overdue DESC, ps.due_date NULLS LAST"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	type apAgingRow struct {
		ID          int64      `json:"id"`
		ParentID    int64      `json:"parent_id"`
		PONumber    string     `json:"po_number"`
		VendorName  string     `json:"vendor_name"`
		Sequence    int        `json:"sequence"`
		Amount      float64    `json:"amount"`
		Status      string     `json:"status"`
		DueDate     *time.Time `json:"due_date,omitempty"`
		ProofFile   string     `json:"proof_file_name,omitempty"`
		DaysOverdue int        `json:"days_overdue"`
	}

	list := []apAgingRow{}
	for rows.Next() {
		var r apAgingRow
		if err := rows.Scan(&r.ID, &r.ParentID, &r.PONumber, &r.VendorName, &r.Sequence, &r.Amount, &r.Status,
			&r.DueDate, &r.ProofFile, &r.DaysOverdue); err == nil {
			list = append(list, r)
		}
	}

	c.JSON(http.StatusOK, list)
}
