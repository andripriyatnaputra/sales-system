package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// resolveApprovalOutcome: kalau approval_request sudah final (approved/rejected),
// kembalikan status itu; kalau masih pending, kembalikan "" (belum ada perubahan).
// Dipakai untuk lazy-sync status entity (PR/PO) dari Approval Engine generik.
func resolveApprovalOutcome(c *gin.Context, approvalRequestID int64) (string, error) {
	ar, err := GetApprovalRequest(c, approvalRequestID)
	if err != nil {
		return "", err
	}
	if ar.Status == "approved" || ar.Status == "rejected" {
		return ar.Status, nil
	}
	return "", nil
}

func departmentIDByName(ctx context.Context, name string) (*int64, error) {
	var id int64
	err := database.Pool.QueryRow(ctx, `SELECT id FROM departments WHERE name = $1`, name).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// CreatePurchaseRequest: Operations only. Item WAJIB dipilih dari sales_order_items
// yang sudah ada (traceability BoQ -> SO -> PR, bukan input bebas).
func CreatePurchaseRequest(c *gin.Context) {
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa membuat Purchase Request"})
		return
	}

	var body struct {
		SalesOrderID int64  `json:"sales_order_id"`
		Notes        string `json:"notes"`
		Items        []struct {
			SalesOrderItemID  int64    `json:"sales_order_item_id"`
			Qty               *float64 `json:"qty"`
			EstimatedUnitCost *float64 `json:"estimated_unit_cost"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SalesOrderID == 0 || len(body.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order_id dan items wajib diisi"})
		return
	}

	var soExists int64
	if err := database.Pool.QueryRow(c, `SELECT id FROM sales_orders WHERE id = $1`, body.SalesOrderID).Scan(&soExists); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order tidak ditemukan"})
		return
	}

	var prID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO purchase_requests (pr_number, sales_order_id, requested_by, notes)
		VALUES ('', $1, $2, NULLIF($3, ''))
		RETURNING id
	`, body.SalesOrderID, c.GetInt64("user_id"), body.Notes).Scan(&prID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	prNumber := fmt.Sprintf("PR-%04d", prID)
	total := 0.0

	for _, it := range body.Items {
		var soItem models.SalesOrderItem
		err := database.Pool.QueryRow(c, `
			SELECT id, sales_order_id, item_name, unit, qty, vendor_cost FROM sales_order_items
			WHERE id = $1 AND sales_order_id = $2
		`, it.SalesOrderItemID, body.SalesOrderID).Scan(&soItem.ID, &soItem.SalesOrderID, &soItem.ItemName, &soItem.Unit, &soItem.Qty, &soItem.VendorCost)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("sales_order_item_id %d tidak ditemukan di sales_order ini", it.SalesOrderItemID)})
			return
		}

		qty := soItem.Qty
		if it.Qty != nil && *it.Qty > 0 {
			qty = *it.Qty
		}
		unitCost := soItem.VendorCost
		if it.EstimatedUnitCost != nil {
			unitCost = it.EstimatedUnitCost
		}

		_, err = database.Pool.Exec(c, `
			INSERT INTO purchase_request_items (purchase_request_id, sales_order_item_id, item_name, unit, qty, estimated_unit_cost)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, prID, soItem.ID, soItem.ItemName, soItem.Unit, qty, unitCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if unitCost != nil {
			total += *unitCost * qty
		}
	}

	_, err = database.Pool.Exec(c, `UPDATE purchase_requests SET pr_number = $1, total_estimated_value = $2 WHERE id = $3`, prNumber, total, prID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "purchase_request", strconv.FormatInt(prID, 10), prNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": prID, "pr_number": prNumber, "total_estimated_value": total})
}

func scanPurchaseRequest(row interface{ Scan(...interface{}) error }) (*models.PurchaseRequest, error) {
	var pr models.PurchaseRequest
	err := row.Scan(&pr.ID, &pr.PRNumber, &pr.SalesOrderID, &pr.SONumber, &pr.RequestedBy, &pr.RequestedByUsername,
		&pr.Status, &pr.TotalEstimatedValue, &pr.ApprovalRequestID, &pr.Notes, &pr.ApprovedAt, &pr.CreatedAt, &pr.UpdatedAt)
	return &pr, err
}

const purchaseRequestSelectBase = `
	SELECT pr.id, pr.pr_number, pr.sales_order_id, so.so_number, pr.requested_by, COALESCE(u.username, ''),
	       pr.status, pr.total_estimated_value, pr.approval_request_id, pr.notes, pr.approved_at, pr.created_at, pr.updated_at
	FROM purchase_requests pr
	JOIN sales_orders so ON so.id = pr.sales_order_id
	LEFT JOIN users u ON u.id = pr.requested_by
`

func queryPurchaseRequestItems(c *gin.Context, prID int64) []models.PurchaseRequestItem {
	rows, err := database.Pool.Query(c, `
		SELECT id, purchase_request_id, sales_order_item_id, item_name, unit, qty, estimated_unit_cost, created_at, updated_at
		FROM purchase_request_items WHERE purchase_request_id = $1 ORDER BY id
	`, prID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	items := []models.PurchaseRequestItem{}
	for rows.Next() {
		var it models.PurchaseRequestItem
		if err := rows.Scan(&it.ID, &it.PurchaseRequestID, &it.SalesOrderItemID, &it.ItemName, &it.Unit, &it.Qty, &it.EstimatedUnitCost, &it.CreatedAt, &it.UpdatedAt); err == nil {
			items = append(items, it)
		}
	}
	return items
}

func ListPurchaseRequests(c *gin.Context) {
	status := c.Query("status")
	query := purchaseRequestSelectBase
	args := []interface{}{}
	if status != "" {
		query += " WHERE pr.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY pr.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.PurchaseRequest{}
	for rows.Next() {
		pr, err := scanPurchaseRequest(rows)
		if err == nil {
			list = append(list, *pr)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetPurchaseRequest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, purchaseRequestSelectBase+" WHERE pr.id = $1", id)
	pr, err := scanPurchaseRequest(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase request not found"})
		return
	}

	if pr.Status == "pending_approval" && pr.ApprovalRequestID != nil {
		outcome, err := resolveApprovalOutcome(c, *pr.ApprovalRequestID)
		if err == nil && outcome != "" {
			now := time.Now()
			_, _ = database.Pool.Exec(c, `
				UPDATE purchase_requests SET status = $1,
				       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN $3 ELSE approved_at END,
				       updated_at = NOW()
				WHERE id = $2
			`, outcome, pr.ID, now)
			pr.Status = outcome
			if outcome == "approved" && pr.ApprovedAt == nil {
				pr.ApprovedAt = &now
			}
		}
	}

	pr.Items = queryPurchaseRequestItems(c, pr.ID)
	c.JSON(http.StatusOK, pr)
}

// SubmitPurchaseRequest: draft -> pending_approval, submit ke Approval Engine.
func SubmitPurchaseRequest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa submit Purchase Request"})
		return
	}

	row := database.Pool.QueryRow(c, purchaseRequestSelectBase+" WHERE pr.id = $1", id)
	pr, err := scanPurchaseRequest(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "purchase request not found"})
		return
	}
	if pr.Status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hanya PR berstatus draft yang bisa disubmit (status saat ini: " + pr.Status + ")"})
		return
	}

	deptID, _ := departmentIDByName(c, "Operations")
	label := pr.PRNumber
	ar, err := SubmitForApproval(c, "purchase_request", strconv.FormatInt(id, 10), &label, &pr.TotalEstimatedValue, deptID, c.GetInt64("user_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newStatus := "pending_approval"
	if ar.Status == "approved" {
		newStatus = "approved"
	}
	_, err = database.Pool.Exec(c, `
		UPDATE purchase_requests SET status = $1, approval_request_id = $2,
		       approved_at = CASE WHEN $1 = 'approved' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
		       updated_at = NOW()
		WHERE id = $3
	`, newStatus, ar.ID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "submit", "purchase_request", strconv.FormatInt(id, 10), pr.PRNumber, gin.H{"approval_request_id": ar.ID, "status": newStatus})

	c.JSON(http.StatusOK, gin.H{"status": newStatus, "approval_request_id": ar.ID})
}
