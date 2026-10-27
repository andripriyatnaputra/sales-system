package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"sales-system-backend/database"
)

func RestoreProject(c *gin.Context) {
	id := c.Param("id")
	var code string
	if err := database.Pool.QueryRow(c, `
		UPDATE projects SET archived_at = NULL, archived_by = NULL, updated_at = NOW()
		WHERE id = $1 AND archived_at IS NOT NULL
		RETURNING project_code
	`, id).Scan(&code); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "archived project not found"})
		return
	}
	LogAudit(c, c.GetInt64("user_id"), "restore", "project", id, code, nil)
	c.JSON(http.StatusOK, gin.H{"status": "restored"})
}

func RestoreCustomer(c *gin.Context) {
	id := c.Param("id")
	var name string
	if err := database.Pool.QueryRow(c, `
		UPDATE customers SET archived_at = NULL, archived_by = NULL, updated_at = NOW()
		WHERE id = $1 AND archived_at IS NOT NULL
		RETURNING name
	`, id).Scan(&name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "archived customer not found"})
		return
	}
	LogAudit(c, c.GetInt64("user_id"), "restore", "customer", id, name, nil)
	c.JSON(http.StatusOK, gin.H{"status": "restored"})
}
