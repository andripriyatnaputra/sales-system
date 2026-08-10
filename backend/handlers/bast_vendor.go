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

// CreateBASTVendor: Operations only, goods receipt dari vendor sesuai PO yang
// SUDAH approved. trigger_payment_schedule_ids opsional -- termin vendor_po
// (milik PO yang sama) yang mau ditandai 'due' begitu BAST ini dibuat (manual,
// bukan auto-parse trigger_description bebas teks).
func CreateBASTVendor(c *gin.Context) {
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa membuat BAST Vendor"})
		return
	}

	var body struct {
		PurchaseOrderID           int64   `json:"purchase_order_id"`
		ReceivedDate              string  `json:"received_date"`
		Status                    string  `json:"status"`
		Notes                     string  `json:"notes"`
		TriggerPaymentScheduleIDs []int64 `json:"trigger_payment_schedule_ids"`
		Items                     []struct {
			PurchaseOrderItemID int64   `json:"purchase_order_item_id"`
			QtyReceived         float64 `json:"qty_received"`
			ConditionNotes      *string `json:"condition_notes"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.PurchaseOrderID == 0 || len(body.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_order_id dan items wajib diisi"})
		return
	}
	if body.Status == "" {
		body.Status = "complete"
	}
	if body.Status != "complete" && body.Status != "partial" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	var poStatus string
	if err := database.Pool.QueryRow(c, `SELECT status FROM purchase_orders WHERE id = $1`, body.PurchaseOrderID).Scan(&poStatus); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_order tidak ditemukan"})
		return
	}
	if poStatus != "approved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_order belum approved (status saat ini: " + poStatus + ")"})
		return
	}

	ctx := c.Request.Context()
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	var bastID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO bast_vendor (bast_number, purchase_order_id, received_by, received_date, status, notes)
		VALUES ('', $1, $2, COALESCE(NULLIF($3, '')::date, CURRENT_DATE), $4, NULLIF($5, ''))
		RETURNING id
	`, body.PurchaseOrderID, c.GetInt64("user_id"), body.ReceivedDate, body.Status, body.Notes).Scan(&bastID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	bastNumber := fmt.Sprintf("BASTV-%04d", bastID)
	_, err = tx.Exec(ctx, `UPDATE bast_vendor SET bast_number = $1 WHERE id = $2`, bastNumber, bastID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, it := range body.Items {
		var poi models.PurchaseOrderItem
		err := tx.QueryRow(ctx, `
			SELECT id FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2
		`, it.PurchaseOrderItemID, body.PurchaseOrderID).Scan(&poi.ID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("purchase_order_item_id %d tidak ditemukan di PO ini", it.PurchaseOrderItemID)})
			return
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO bast_vendor_items (bast_vendor_id, purchase_order_item_id, qty_received, condition_notes)
			VALUES ($1, $2, $3, $4)
		`, bastID, it.PurchaseOrderItemID, it.QtyReceived, it.ConditionNotes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	for _, scheduleID := range body.TriggerPaymentScheduleIDs {
		_, err = tx.Exec(ctx, `
			UPDATE payment_schedules SET status = 'due', updated_at = NOW()
			WHERE id = $1 AND parent_type = 'vendor_po' AND parent_id = $2 AND status = 'pending'
		`, scheduleID, body.PurchaseOrderID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := postBASTVendorJournal(ctx, tx, bastID, body.PurchaseOrderID, c.GetInt64("user_id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal posting jurnal GL: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "bast_vendor", strconv.FormatInt(bastID, 10), bastNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": bastID, "bast_number": bastNumber})
}

func scanBASTVendor(row interface{ Scan(...interface{}) error }) (*models.BASTVendor, error) {
	var b models.BASTVendor
	var poApprovedAt *time.Time
	err := row.Scan(&b.ID, &b.BASTNumber, &b.PurchaseOrderID, &b.PONumber, &b.ReceivedBy, &b.ReceivedByName,
		&b.ReceivedDate, &b.Status, &b.Notes, &b.CreatedAt, &b.UpdatedAt, &poApprovedAt)
	if err != nil {
		return &b, err
	}
	b.TurnaroundDays = daysBetween(poApprovedAt, &b.CreatedAt)
	return &b, nil
}

const bastVendorSelectBase = `
	SELECT bv.id, bv.bast_number, bv.purchase_order_id, po.po_number, bv.received_by, COALESCE(u.username, ''),
	       bv.received_date, bv.status, bv.notes, bv.created_at, bv.updated_at, po.approved_at
	FROM bast_vendor bv
	JOIN purchase_orders po ON po.id = bv.purchase_order_id
	LEFT JOIN users u ON u.id = bv.received_by
`

func ListBASTVendor(c *gin.Context) {
	poID := c.Query("purchase_order_id")
	query := bastVendorSelectBase
	args := []interface{}{}
	if poID != "" {
		query += " WHERE bv.purchase_order_id = $1"
		args = append(args, poID)
	}
	query += " ORDER BY bv.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.BASTVendor{}
	for rows.Next() {
		b, err := scanBASTVendor(rows)
		if err == nil {
			list = append(list, *b)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetBASTVendor(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, bastVendorSelectBase+" WHERE bv.id = $1", id)
	b, err := scanBASTVendor(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bast vendor not found"})
		return
	}

	rows, err := database.Pool.Query(c, `
		SELECT bvi.id, bvi.bast_vendor_id, bvi.purchase_order_item_id, poi.item_name, bvi.qty_received, bvi.condition_notes, bvi.created_at
		FROM bast_vendor_items bvi
		JOIN purchase_order_items poi ON poi.id = bvi.purchase_order_item_id
		WHERE bvi.bast_vendor_id = $1 ORDER BY bvi.id
	`, b.ID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it models.BASTVendorItem
			if err := rows.Scan(&it.ID, &it.BASTVendorID, &it.PurchaseOrderItemID, &it.ItemName, &it.QtyReceived, &it.ConditionNotes, &it.CreatedAt); err == nil {
				b.Items = append(b.Items, it)
			}
		}
	}

	c.JSON(http.StatusOK, b)
}
