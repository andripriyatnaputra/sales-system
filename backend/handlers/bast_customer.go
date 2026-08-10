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

// CreateBASTCustomer: Operations only, serah terima ke customer. Independen dari
// BAST Vendor (ada SO item yang murni jasa internal, tidak lewat procurement
// vendor) -- lihat komentar migrasi 0011. Jadi trigger Fase 2 (invoicing).
func CreateBASTCustomer(c *gin.Context) {
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa membuat BAST Customer"})
		return
	}

	var body struct {
		SalesOrderID      int64  `json:"sales_order_id"`
		DeliveredDate     string `json:"delivered_date"`
		Status            string `json:"status"`
		CustomerSignatory string `json:"customer_signatory"`
		Notes             string `json:"notes"`
		Items             []struct {
			SalesOrderItemID int64   `json:"sales_order_item_id"`
			QtyDelivered     float64 `json:"qty_delivered"`
			Notes            *string `json:"notes"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SalesOrderID == 0 || len(body.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order_id dan items wajib diisi"})
		return
	}
	if body.Status == "" {
		body.Status = "complete"
	}
	if body.Status != "complete" && body.Status != "partial" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	var soExists int64
	if err := database.Pool.QueryRow(c, `SELECT id FROM sales_orders WHERE id = $1`, body.SalesOrderID).Scan(&soExists); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sales_order tidak ditemukan"})
		return
	}

	var bastID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO bast_customer (bast_number, sales_order_id, delivered_by, delivered_date, status, customer_signatory, notes)
		VALUES ('', $1, $2, COALESCE(NULLIF($3, '')::date, CURRENT_DATE), $4, NULLIF($5, ''), NULLIF($6, ''))
		RETURNING id
	`, body.SalesOrderID, c.GetInt64("user_id"), body.DeliveredDate, body.Status, body.CustomerSignatory, body.Notes).Scan(&bastID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	bastNumber := fmt.Sprintf("BASTC-%04d", bastID)
	_, err = database.Pool.Exec(c, `UPDATE bast_customer SET bast_number = $1 WHERE id = $2`, bastNumber, bastID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, it := range body.Items {
		var soi int64
		err := database.Pool.QueryRow(c, `
			SELECT id FROM sales_order_items WHERE id = $1 AND sales_order_id = $2
		`, it.SalesOrderItemID, body.SalesOrderID).Scan(&soi)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("sales_order_item_id %d tidak ditemukan di SO ini", it.SalesOrderItemID)})
			return
		}
		_, err = database.Pool.Exec(c, `
			INSERT INTO bast_customer_items (bast_customer_id, sales_order_item_id, qty_delivered, notes)
			VALUES ($1, $2, $3, $4)
		`, bastID, it.SalesOrderItemID, it.QtyDelivered, it.Notes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "bast_customer", strconv.FormatInt(bastID, 10), bastNumber, body)

	maybeHandoverToManagedService(c, body.SalesOrderID)

	// Auto-advance Post-PO Monitoring Stage 4 (Goods Receipt/Service
	// Acceptance) -- "complete" = Done, "partial" = In Progress (belum
	// tuntas). Efek samping best-effort, tidak pernah menurunkan status.
	postpoStage4Status := "In Progress"
	if body.Status == "complete" {
		postpoStage4Status = "Done"
	}
	maybeAdvancePostPOStage(c, body.SalesOrderID, 4, postpoStage4Status, c.GetInt64("user_id"))

	c.JSON(http.StatusCreated, gin.H{"id": bastID, "bast_number": bastNumber})
}

// maybeHandoverToManagedService: project Recurring/New Recurring berpindah
// tanggung jawab operasional dari Ops Implementations ke Ops Managed Service
// begitu BAST Customer pertama dibuat (instalasi/delivery selesai). Otomatis
// & idempoten -- bukan langkah approval, karena tidak ada ambiguitas yang
// butuh keputusan manusia (beda dengan trigger payment_schedules di BAST
// Vendor yang sengaja manual). Project Based tidak pernah berpindah.
//
// Kegagalan di sini SENGAJA silent (bukan 500 ke user) -- ini efek samping
// sekunder dari pembuatan BAST Customer yang sudah berhasil di atasnya,
// bukan bagian kritikal transaksi tsb.
func maybeHandoverToManagedService(c *gin.Context, salesOrderID int64) {
	var projectID int64
	var projectType, opsTeam string
	err := database.Pool.QueryRow(c, `
		SELECT p.id, p.project_type, p.ops_team
		FROM projects p
		JOIN sales_orders so ON so.project_id = p.id
		WHERE so.id = $1
	`, salesOrderID).Scan(&projectID, &projectType, &opsTeam)
	if err != nil || opsTeam == "Managed Service" {
		return
	}
	if projectType != "Recurring" && projectType != "New Recurring" {
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE projects SET ops_team = 'Managed Service', ops_handover_date = NOW() WHERE id = $1
	`, projectID)
	if err == nil {
		LogAudit(c, c.GetInt64("user_id"), "handover", "project_ops_team",
			strconv.FormatInt(projectID, 10), "Managed Service", nil)
	}
}

func scanBASTCustomer(row interface{ Scan(...interface{}) error }) (*models.BASTCustomer, error) {
	var b models.BASTCustomer
	var soCreatedAt time.Time
	err := row.Scan(&b.ID, &b.BASTNumber, &b.SalesOrderID, &b.SONumber, &b.DeliveredBy, &b.DeliveredByName,
		&b.DeliveredDate, &b.Status, &b.CustomerSignatory, &b.Notes, &b.CreatedAt, &b.UpdatedAt, &soCreatedAt)
	if err != nil {
		return &b, err
	}
	if days := daysBetween(&soCreatedAt, &b.CreatedAt); days != nil {
		b.TurnaroundDays = *days
	}
	return &b, nil
}

const bastCustomerSelectBase = `
	SELECT bc.id, bc.bast_number, bc.sales_order_id, so.so_number, bc.delivered_by, COALESCE(u.username, ''),
	       bc.delivered_date, bc.status, bc.customer_signatory, bc.notes, bc.created_at, bc.updated_at, so.created_at
	FROM bast_customer bc
	JOIN sales_orders so ON so.id = bc.sales_order_id
	LEFT JOIN users u ON u.id = bc.delivered_by
`

func ListBASTCustomer(c *gin.Context) {
	soID := c.Query("sales_order_id")
	query := bastCustomerSelectBase
	args := []interface{}{}
	if soID != "" {
		query += " WHERE bc.sales_order_id = $1"
		args = append(args, soID)
	}
	query += " ORDER BY bc.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.BASTCustomer{}
	for rows.Next() {
		b, err := scanBASTCustomer(rows)
		if err == nil {
			list = append(list, *b)
		}
	}
	c.JSON(http.StatusOK, list)
}

func GetBASTCustomer(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row := database.Pool.QueryRow(c, bastCustomerSelectBase+" WHERE bc.id = $1", id)
	b, err := scanBASTCustomer(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bast customer not found"})
		return
	}

	rows, err := database.Pool.Query(c, `
		SELECT bci.id, bci.bast_customer_id, bci.sales_order_item_id, soi.item_name, bci.qty_delivered, bci.notes, bci.created_at
		FROM bast_customer_items bci
		JOIN sales_order_items soi ON soi.id = bci.sales_order_item_id
		WHERE bci.bast_customer_id = $1 ORDER BY bci.id
	`, b.ID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it models.BASTCustomerItem
			if err := rows.Scan(&it.ID, &it.BASTCustomerID, &it.SalesOrderItemID, &it.ItemName, &it.QtyDelivered, &it.Notes, &it.CreatedAt); err == nil {
				b.Items = append(b.Items, it)
			}
		}
	}

	c.JSON(http.StatusOK, b)
}
