package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ensureSalesOrderForProject: dipanggil dari project_create.go & project_update.go
// begitu sph_status project jadi 'Win'. Idempoten -- kalau sales_orders utk
// project ini sudah ada, tidak melakukan apa-apa. Menarik boq_items yang sudah
// disetujui di presales (Fase 1 langkah 5) sebagai SNAPSHOT ke sales_order_items,
// bukan referensi hidup.
func ensureSalesOrderForProject(ctx context.Context, projectID int64, createdBy int64) error {
	var existingID int64
	err := database.Pool.QueryRow(ctx, `SELECT id FROM sales_orders WHERE project_id = $1`, projectID).Scan(&existingID)
	if err == nil {
		return nil // sudah ada, jangan dobel
	}

	var customerID *int64
	err = database.Pool.QueryRow(ctx, `SELECT customer_id FROM projects WHERE id = $1`, projectID).Scan(&customerID)
	if err != nil {
		return err
	}

	items, err := queryBOQItems(ctx, projectID)
	if err != nil {
		return err
	}

	total := 0.0
	for _, it := range items {
		if it.ProposedSellPrice != nil {
			total += *it.ProposedSellPrice * it.Qty
		}
	}

	var soID int64
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO sales_orders (project_id, so_number, customer_id, total_value, created_by)
		VALUES ($1, '', $2, $3, $4)
		RETURNING id
	`, projectID, customerID, total, createdBy).Scan(&soID)
	if err != nil {
		return err
	}

	soNumber := fmt.Sprintf("SO-%04d", soID)
	_, err = database.Pool.Exec(ctx, `UPDATE sales_orders SET so_number = $1 WHERE id = $2`, soNumber, soID)
	if err != nil {
		return err
	}

	for _, it := range items {
		_, err = database.Pool.Exec(ctx, `
			INSERT INTO sales_order_items (sales_order_id, boq_item_id, item_name, unit, qty, vendor_cost, install_cost, sell_price)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, soID, it.ID, it.ItemName, it.Unit, it.Qty, it.EstimatedVendorCost, it.EstimatedInstallCost, it.ProposedSellPrice)
		if err != nil {
			return err
		}
	}

	LogAudit(ctx, createdBy, "auto_create", "sales_order", strconv.FormatInt(soID, 10), soNumber, gin.H{
		"project_id":  projectID,
		"total_value": total,
		"item_count":  len(items),
	})

	return nil
}

func scanSalesOrder(ctx context.Context, row interface{ Scan(...interface{}) error }) (*models.SalesOrder, error) {
	var so models.SalesOrder
	err := row.Scan(&so.ID, &so.ProjectID, &so.ProjectCode, &so.SONumber, &so.CustomerID, &so.CustomerName,
		&so.TotalValue, &so.Status, &so.CreatedBy, &so.CreatedAt, &so.UpdatedAt)
	return &so, err
}

const salesOrderSelectBase = `
	SELECT so.id, so.project_id, p.project_code, so.so_number, so.customer_id, COALESCE(c.name, ''),
	       so.total_value, so.status, so.created_by, so.created_at, so.updated_at
	FROM sales_orders so
	JOIN projects p ON p.id = so.project_id
	LEFT JOIN customers c ON c.id = so.customer_id
`

func queryCustomerPOs(ctx context.Context, salesOrderID int64) ([]models.CustomerPurchaseOrder, error) {
	rows, err := database.Pool.Query(ctx, `
		SELECT id, sales_order_id, po_number, po_date, category, amount, created_at, updated_at
		FROM customer_purchase_orders WHERE sales_order_id = $1 ORDER BY id
	`, salesOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pos := []models.CustomerPurchaseOrder{}
	for rows.Next() {
		var po models.CustomerPurchaseOrder
		if err := rows.Scan(&po.ID, &po.SalesOrderID, &po.PONumber, &po.PODate, &po.Category, &po.Amount, &po.CreatedAt, &po.UpdatedAt); err == nil {
			pos = append(pos, po)
		}
	}
	return pos, nil
}

// ListSalesOrders: division-scoped sama seperti ListProjects (role=="user" cuma
// lihat SO dari project di division-nya sendiri).
func ListSalesOrders(c *gin.Context) {
	userDiv := NormalizeDivision(c.GetString("division"))

	query := salesOrderSelectBase
	args := []interface{}{}
	if isSalesDivisionLocked(c) {
		query += " WHERE p.division = $1"
		args = append(args, userDiv)
	}
	query += " ORDER BY so.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.SalesOrder{}
	for rows.Next() {
		so, err := scanSalesOrder(c, rows)
		if err == nil {
			list = append(list, *so)
		}
	}

	c.JSON(http.StatusOK, list)
}

// fetchSalesOrderDetail: satu titik logic ambil SO + items + ACL division-scope,
// dipakai baik oleh GetSalesOrder (by so id) maupun GetSalesOrderByProject (by
// project id) supaya tidak duplikasi.
func fetchSalesOrderDetail(c *gin.Context, soID int64) (*models.SalesOrder, int, string) {
	row := database.Pool.QueryRow(c, salesOrderSelectBase+" WHERE so.id = $1", soID)
	so, err := scanSalesOrder(c, row)
	if err != nil {
		return nil, http.StatusNotFound, "sales order not found"
	}

	userDiv := NormalizeDivision(c.GetString("division"))
	if isSalesDivisionLocked(c) {
		var projectDiv string
		_ = database.Pool.QueryRow(c, `SELECT division FROM projects WHERE id = $1`, so.ProjectID).Scan(&projectDiv)
		if NormalizeDivision(projectDiv) != userDiv {
			return nil, http.StatusForbidden, "forbidden: different division"
		}
	}

	rows, err := database.Pool.Query(c, `
		SELECT id, sales_order_id, boq_item_id, item_name, unit, qty, vendor_cost, install_cost, sell_price, created_at
		FROM sales_order_items WHERE sales_order_id = $1 ORDER BY id
	`, so.ID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it models.SalesOrderItem
			if err := rows.Scan(&it.ID, &it.SalesOrderID, &it.BOQItemID, &it.ItemName, &it.Unit, &it.Qty,
				&it.VendorCost, &it.InstallCost, &it.SellPrice, &it.CreatedAt); err == nil {
				so.Items = append(so.Items, it)
			}
		}
	}

	so.CustomerPOs, _ = queryCustomerPOs(c, so.ID)

	return so, http.StatusOK, ""
}

func GetSalesOrder(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	so, status, errMsg := fetchSalesOrderDetail(c, id)
	if errMsg != "" {
		c.JSON(status, gin.H{"error": errMsg})
		return
	}
	c.JSON(status, so)
}

func GetSalesOrderByProject(c *gin.Context) {
	projectID := c.Param("id")

	var soID int64
	err := database.Pool.QueryRow(c, `SELECT id FROM sales_orders WHERE project_id = $1`, projectID).Scan(&soID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "sales order belum dibuat untuk project ini (project belum Win)"})
		return
	}

	so, status, errMsg := fetchSalesOrderDetail(c, soID)
	if errMsg != "" {
		c.JSON(status, gin.H{"error": errMsg})
		return
	}
	c.JSON(status, so)
}

func UpdateSalesOrder(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Status *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != nil && *body.Status != "active" && *body.Status != "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	_, err := database.Pool.Exec(c, `
		UPDATE sales_orders SET status = COALESCE($1, status), updated_at = NOW() WHERE id = $2
	`, body.Status, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "sales_order", id, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// CreateCustomerPO: satu Sales Order bisa punya lebih dari satu PO customer
// (mis. dipecah Material vs Jasa/Instalasi) -- lihat komentar migrasi 0009.
func CreateCustomerPO(c *gin.Context) {
	salesOrderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sales order id"})
		return
	}

	var body struct {
		PONumber string   `json:"po_number"`
		PODate   *string  `json:"po_date"`
		Category *string  `json:"category"`
		Amount   *float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.PONumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "po_number is required"})
		return
	}

	var id int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO customer_purchase_orders (sales_order_id, po_number, po_date, category, amount)
		VALUES ($1, $2, $3::date, $4, $5)
		RETURNING id
	`, salesOrderID, body.PONumber, body.PODate, body.Category, body.Amount).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "customer_purchase_order", strconv.FormatInt(id, 10), body.PONumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateCustomerPO(c *gin.Context) {
	poID := c.Param("poId")

	var body struct {
		PONumber *string  `json:"po_number"`
		PODate   *string  `json:"po_date"`
		Category *string  `json:"category"`
		Amount   *float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	_, err := database.Pool.Exec(c, `
		UPDATE customer_purchase_orders
		SET po_number = COALESCE(NULLIF($1, ''), po_number),
		    po_date = COALESCE($2::date, po_date),
		    category = COALESCE($3, category),
		    amount = COALESCE($4, amount),
		    updated_at = NOW()
		WHERE id = $5
	`, body.PONumber, body.PODate, body.Category, body.Amount, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "customer_purchase_order", poID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func DeleteCustomerPO(c *gin.Context) {
	poID := c.Param("poId")

	result, err := database.Pool.Exec(c, `DELETE FROM customer_purchase_orders WHERE id = $1`, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer PO not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "customer_purchase_order", poID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
