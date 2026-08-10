package handlers

import (
	"net/http"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

// DeleteVendor: SOFT delete (status='inactive'), bukan hapus baris. Vendor akan
// jadi referensi FK dari Purchase Order (Fase 1 langkah 7) -- hard delete akan
// merusak riwayat PO begitu modul itu dibangun.
func DeleteVendor(c *gin.Context) {
	id := c.Param("id")

	result, err := database.Pool.Exec(c, `UPDATE vendors SET status = 'inactive', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "vendor not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "deactivate", "vendor", id, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deactivated"})
}
