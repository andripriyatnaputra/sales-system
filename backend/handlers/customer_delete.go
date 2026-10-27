package handlers

import (
	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func DeleteCustomer(c *gin.Context) {
	id := c.Param("id")
	var name string
	_ = database.Pool.QueryRow(c, `SELECT name FROM customers WHERE id=$1`, id).Scan(&name)

	result, err := database.Pool.Exec(c, `DELETE FROM customers WHERE id=$1`, id)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(404, gin.H{"error": "customer not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "customer", id, name, nil)

	c.JSON(200, gin.H{"status": "deleted"})
}
