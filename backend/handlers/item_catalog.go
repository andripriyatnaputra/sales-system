package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func scanItemCatalog(row interface{ Scan(...interface{}) error }) (*models.ItemCatalog, error) {
	var i models.ItemCatalog
	err := row.Scan(&i.ID, &i.ItemCode, &i.ItemName, &i.Unit, &i.Category,
		&i.DefaultVendorCost, &i.DefaultInstallCost, &i.DefaultSellPrice, &i.Status, &i.Notes, &i.CreatedAt, &i.UpdatedAt)
	return &i, err
}

const itemCatalogSelectBase = `
	SELECT id, item_code, item_name, unit, category,
	       default_vendor_cost, default_install_cost, default_sell_price, status, notes, created_at, updated_at
	FROM item_catalog
`

// ListItemCatalog: read terbuka (semua user login) -- dibutuhkan ProDev
// (picker BoQ) DAN Procurement (reference vendor cost saat negosiasi PO).
func ListItemCatalog(c *gin.Context) {
	query := itemCatalogSelectBase
	args := []interface{}{}
	conds := []string{}

	if status := c.Query("status"); status != "" {
		conds = append(conds, "status = $"+strconv.Itoa(len(args)+1))
		args = append(args, status)
	}
	if search := c.Query("search"); search != "" {
		conds = append(conds, "item_name ILIKE $"+strconv.Itoa(len(args)+1))
		args = append(args, "%"+search+"%")
	}
	for i, cond := range conds {
		if i == 0 {
			query += " WHERE " + cond
		} else {
			query += " AND " + cond
		}
	}
	query += " ORDER BY item_code"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.ItemCatalog{}
	for rows.Next() {
		item, err := scanItemCatalog(rows)
		if err == nil {
			list = append(list, *item)
		}
	}
	c.JSON(http.StatusOK, list)
}

func CreateItemCatalog(c *gin.Context) {
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa membuat item katalog"})
		return
	}

	var body struct {
		ItemName           string   `json:"item_name"`
		Unit               *string  `json:"unit"`
		Category           *string  `json:"category"`
		DefaultVendorCost  *float64 `json:"default_vendor_cost"`
		DefaultInstallCost *float64 `json:"default_install_cost"`
		DefaultSellPrice   *float64 `json:"default_sell_price"`
		Notes              *string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ItemName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item_name wajib diisi"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO item_catalog (item_code, item_name, unit, category, default_vendor_cost, default_install_cost, default_sell_price, notes)
		VALUES ('', $1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, body.ItemName, body.Unit, body.Category, body.DefaultVendorCost, body.DefaultInstallCost, body.DefaultSellPrice, body.Notes).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	itemCode := fmt.Sprintf("ITM-%04d", id)
	if _, err := database.Pool.Exec(c, `UPDATE item_catalog SET item_code = $1 WHERE id = $2`, itemCode, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "item_catalog", strconv.FormatInt(id, 10), itemCode, body)

	c.JSON(http.StatusCreated, gin.H{"id": id, "item_code": itemCode})
}

func UpdateItemCatalog(c *gin.Context) {
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa mengubah item katalog"})
		return
	}
	id := c.Param("id")

	var body struct {
		ItemName           *string  `json:"item_name"`
		Unit               *string  `json:"unit"`
		Category           *string  `json:"category"`
		DefaultVendorCost  *float64 `json:"default_vendor_cost"`
		DefaultInstallCost *float64 `json:"default_install_cost"`
		DefaultSellPrice   *float64 `json:"default_sell_price"`
		Notes              *string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE item_catalog
		SET item_name = COALESCE($1, item_name),
		    unit = COALESCE($2, unit),
		    category = COALESCE($3, category),
		    default_vendor_cost = COALESCE($4, default_vendor_cost),
		    default_install_cost = COALESCE($5, default_install_cost),
		    default_sell_price = COALESCE($6, default_sell_price),
		    notes = COALESCE($7, notes),
		    updated_at = NOW()
		WHERE id = $8
	`, body.ItemName, body.Unit, body.Category, body.DefaultVendorCost, body.DefaultInstallCost, body.DefaultSellPrice, body.Notes, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item katalog tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "item_catalog", id, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// DeleteItemCatalog: soft-delete TANPA blocking check -- item_catalog FLAT
// (bukan hierarkis spt chart_of_accounts), boq_items lama yang sudah pakai
// catalog_item_id tetap valid walau item katalognya dinonaktifkan.
func DeleteItemCatalog(c *gin.Context) {
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa menghapus item katalog"})
		return
	}
	id := c.Param("id")

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE item_catalog SET status = 'inactive', updated_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item katalog tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "item_catalog", id, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
