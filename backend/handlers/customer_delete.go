package handlers

import (
	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func DeleteCustomer(c *gin.Context) {
	id := c.Param("id")

	_, err := database.Pool.Exec(c, `DELETE FROM customers WHERE id=$1`, id)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "deleted"})
}
