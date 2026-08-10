package handlers

import (
	"context"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func queryBOQItems(ctx context.Context, projectID int64) ([]models.BOQItem, error) {
	rows, err := database.Pool.Query(ctx, `
		SELECT bi.id, bi.project_id, bi.item_name, bi.unit, bi.qty, bi.estimated_vendor_cost, bi.estimated_install_cost, bi.proposed_sell_price,
		       bi.created_at, bi.updated_at, bi.catalog_item_id, bi.source_document_id, COALESCE(pd.file_name, '')
		FROM boq_items bi
		LEFT JOIN presales_documents pd ON pd.id = bi.source_document_id
		WHERE bi.project_id = $1 ORDER BY bi.id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.BOQItem{}
	for rows.Next() {
		var it models.BOQItem
		if err := rows.Scan(&it.ID, &it.ProjectID, &it.ItemName, &it.Unit, &it.Qty,
			&it.EstimatedVendorCost, &it.EstimatedInstallCost, &it.ProposedSellPrice, &it.CreatedAt, &it.UpdatedAt, &it.CatalogItemID,
			&it.SourceDocumentID, &it.SourceDocumentName); err == nil {
			items = append(items, it)
		}
	}
	return items, nil
}

func ListBOQItems(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	items, err := queryBOQItems(c, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	c.JSON(http.StatusOK, items)
}

// CreateBOQItem: ProDev only -- BoQ dibuat sekali oleh ProDev saat presales, lalu
// item yang sama mengalir ke Quotation/SO/PR/PO/Invoice tanpa input ulang.
func CreateBOQItem(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa membuat BoQ item"})
		return
	}

	var body struct {
		ItemName             string   `json:"item_name"`
		Unit                 *string  `json:"unit"`
		Qty                  float64  `json:"qty"`
		EstimatedVendorCost  *float64 `json:"estimated_vendor_cost"`
		EstimatedInstallCost *float64 `json:"estimated_install_cost"`
		ProposedSellPrice    *float64 `json:"proposed_sell_price"`
		CatalogItemID        *int64   `json:"catalog_item_id"`
		SourceDocumentID     *int64   `json:"source_document_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ItemName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item_name is required"})
		return
	}
	if body.Qty <= 0 {
		body.Qty = 1
	}

	var id int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO boq_items (project_id, item_name, unit, qty, estimated_vendor_cost, estimated_install_cost, proposed_sell_price, catalog_item_id, source_document_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, projectID, body.ItemName, body.Unit, body.Qty, body.EstimatedVendorCost, body.EstimatedInstallCost, body.ProposedSellPrice, body.CatalogItemID, body.SourceDocumentID).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "boq_item", strconv.FormatInt(id, 10), body.ItemName, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateBOQItem(c *gin.Context) {
	itemID := c.Param("itemId")
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa mengubah BoQ item"})
		return
	}

	var body struct {
		ItemName             *string  `json:"item_name"`
		Unit                 *string  `json:"unit"`
		Qty                  *float64 `json:"qty"`
		EstimatedVendorCost  *float64 `json:"estimated_vendor_cost"`
		EstimatedInstallCost *float64 `json:"estimated_install_cost"`
		ProposedSellPrice    *float64 `json:"proposed_sell_price"`
		CatalogItemID        *int64   `json:"catalog_item_id"`
		SourceDocumentID     *int64   `json:"source_document_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	tx, err := database.Pool.Begin(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(c)

	// Snapshot NILAI LAMA (sebelum diubah) ke boq_item_history -- beda dari
	// LogAudit di bawah yang cuma catat nilai BARU yang dikirim, ini justru
	// jejak "apa nilai sebelum diedit", supaya bisa dijawab "kenapa BoQ
	// berubah" (mis. krn SoW baru masuk).
	var old models.BOQItemHistory
	err = tx.QueryRow(c, `
		SELECT item_name, unit, qty, estimated_vendor_cost, estimated_install_cost, proposed_sell_price, source_document_id
		FROM boq_items WHERE id = $1
	`, itemID).Scan(&old.ItemName, &old.Unit, &old.Qty, &old.EstimatedVendorCost, &old.EstimatedInstallCost, &old.ProposedSellPrice, &old.SourceDocumentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "boq item tidak ditemukan"})
		return
	}

	_, err = tx.Exec(c, `
		INSERT INTO boq_item_history (boq_item_id, item_name, unit, qty, estimated_vendor_cost, estimated_install_cost, proposed_sell_price, source_document_id, changed_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, itemID, old.ItemName, old.Unit, old.Qty, old.EstimatedVendorCost, old.EstimatedInstallCost, old.ProposedSellPrice, old.SourceDocumentID, c.GetInt64("user_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = tx.Exec(c, `
		UPDATE boq_items
		SET item_name = COALESCE($1, item_name),
		    unit = COALESCE($2, unit),
		    qty = COALESCE($3, qty),
		    estimated_vendor_cost = COALESCE($4, estimated_vendor_cost),
		    estimated_install_cost = COALESCE($5, estimated_install_cost),
		    proposed_sell_price = COALESCE($6, proposed_sell_price),
		    catalog_item_id = COALESCE($7, catalog_item_id),
		    source_document_id = COALESCE($8, source_document_id),
		    updated_at = NOW()
		WHERE id = $9
	`, body.ItemName, body.Unit, body.Qty, body.EstimatedVendorCost, body.EstimatedInstallCost, body.ProposedSellPrice, body.CatalogItemID, body.SourceDocumentID, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "transaction commit error"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "boq_item", itemID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func DeleteBOQItem(c *gin.Context) {
	itemID := c.Param("itemId")
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa menghapus BoQ item"})
		return
	}

	result, err := database.Pool.Exec(c, `DELETE FROM boq_items WHERE id = $1`, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "boq item not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "boq_item", itemID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ListBOQItemHistory: read terbuka, sama pola ListBOQItems (tidak digate
// department) -- histori nilai lama tiap kali item diedit, urut terbaru dulu.
func ListBOQItemHistory(c *gin.Context) {
	itemID := c.Param("itemId")

	rows, err := database.Pool.Query(c, `
		SELECT h.id, h.boq_item_id, h.item_name, h.unit, h.qty, h.estimated_vendor_cost, h.estimated_install_cost, h.proposed_sell_price,
		       h.source_document_id, COALESCE(pd.file_name, ''), h.changed_by, COALESCE(u.username, ''), h.changed_at
		FROM boq_item_history h
		LEFT JOIN presales_documents pd ON pd.id = h.source_document_id
		LEFT JOIN users u ON u.id = h.changed_by
		WHERE h.boq_item_id = $1
		ORDER BY h.changed_at DESC
	`, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.BOQItemHistory{}
	for rows.Next() {
		var h models.BOQItemHistory
		if err := rows.Scan(&h.ID, &h.BOQItemID, &h.ItemName, &h.Unit, &h.Qty, &h.EstimatedVendorCost, &h.EstimatedInstallCost, &h.ProposedSellPrice,
			&h.SourceDocumentID, &h.SourceDocumentName, &h.ChangedBy, &h.ChangedByUsername, &h.ChangedAt); err == nil {
			list = append(list, h)
		}
	}

	c.JSON(http.StatusOK, list)
}
