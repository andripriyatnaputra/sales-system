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

// CreateBillingRequest: META (Memo Tagih) -- Operations minta Finance menagih
// customer. Beda dari PR/PO/BAST, tidak wajib pilih item existing -- cukup
// amount + description, karena ini permintaan tagih, bukan transaksi
// procurement detail.
func CreateBillingRequest(c *gin.Context) {
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa membuat META"})
		return
	}

	var body struct {
		SalesOrderID int64   `json:"sales_order_id"`
		Amount       float64 `json:"amount"`
		Description  string  `json:"description"`
		Notes        string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SalesOrderID == 0 || body.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order_id dan amount (>0) wajib diisi"})
		return
	}

	var soExists int64
	if err := database.Pool.QueryRow(c, `SELECT id FROM sales_orders WHERE id = $1`, body.SalesOrderID).Scan(&soExists); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order tidak ditemukan"})
		return
	}

	var brID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO billing_requests (meta_number, sales_order_id, requested_by, amount, description, notes)
		VALUES ('', $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''))
		RETURNING id
	`, body.SalesOrderID, c.GetInt64("user_id"), body.Amount, body.Description, body.Notes).Scan(&brID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	metaNumber := fmt.Sprintf("META-%04d", brID)
	_, err = database.Pool.Exec(c, `UPDATE billing_requests SET meta_number = $1 WHERE id = $2`, metaNumber, brID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "billing_request", strconv.FormatInt(brID, 10), metaNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": brID, "meta_number": metaNumber})
}

func scanBillingRequest(row interface{ Scan(...interface{}) error }) (*models.BillingRequest, error) {
	var br models.BillingRequest
	err := row.Scan(&br.ID, &br.METANumber, &br.SalesOrderID, &br.SONumber, &br.RequestedBy, &br.RequestedByUsername,
		&br.Status, &br.Amount, &br.Description, &br.ApprovalRequestID, &br.Notes, &br.ApprovedAt, &br.CreatedAt, &br.UpdatedAt)
	return &br, err
}

const billingRequestSelectBase = `
	SELECT br.id, br.meta_number, br.sales_order_id, so.so_number, br.requested_by, COALESCE(u.username, ''),
	       br.status, br.amount, br.description, br.approval_request_id, br.notes, br.approved_at, br.created_at, br.updated_at
	FROM billing_requests br
	JOIN sales_orders so ON so.id = br.sales_order_id
	LEFT JOIN users u ON u.id = br.requested_by
`

func ListBillingRequests(c *gin.Context) {
	status := c.Query("status")
	query := billingRequestSelectBase
	args := []interface{}{}
	if status != "" {
		query += " WHERE br.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY br.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.BillingRequest{}
	for rows.Next() {
		br, err := scanBillingRequest(rows)
		if err == nil {
			list = append(list, *br)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetBillingRequest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, billingRequestSelectBase+" WHERE br.id = $1", id)
	br, err := scanBillingRequest(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "billing request not found"})
		return
	}

	if br.Status == "pending_approval" && br.ApprovalRequestID != nil {
		outcome, err := resolveApprovalOutcome(c, *br.ApprovalRequestID)
		if err == nil && outcome != "" {
			now := time.Now()
			_, _ = database.Pool.Exec(c, `
				UPDATE billing_requests SET status = $1,
				       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN $3 ELSE approved_at END,
				       updated_at = NOW()
				WHERE id = $2
			`, outcome, br.ID, now)
			br.Status = outcome
			if outcome == "approved" && br.ApprovedAt == nil {
				br.ApprovedAt = &now
			}
		}
	}

	c.JSON(http.StatusOK, br)
}

// SubmitBillingRequest: draft -> pending_approval, submit ke Approval Engine.
// Mirror persis SubmitPurchaseRequest.
func SubmitBillingRequest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa submit META"})
		return
	}

	row := database.Pool.QueryRow(c, billingRequestSelectBase+" WHERE br.id = $1", id)
	br, err := scanBillingRequest(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "billing request not found"})
		return
	}
	if br.Status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hanya META berstatus draft yang bisa disubmit (status saat ini: " + br.Status + ")"})
		return
	}

	deptID, _ := departmentIDByName(c, "Operations")
	label := br.METANumber
	ar, err := SubmitForApproval(c, "billing_request", strconv.FormatInt(id, 10), &label, &br.Amount, deptID, c.GetInt64("user_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newStatus := "pending_approval"
	if ar.Status == "approved" {
		newStatus = "approved"
	}
	_, err = database.Pool.Exec(c, `
		UPDATE billing_requests SET status = $1, approval_request_id = $2,
		       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
		       updated_at = NOW()
		WHERE id = $3
	`, newStatus, ar.ID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "submit", "billing_request", strconv.FormatInt(id, 10), br.METANumber, gin.H{"approval_request_id": ar.ID, "status": newStatus})

	c.JSON(http.StatusOK, gin.H{"status": newStatus, "approval_request_id": ar.ID})
}
