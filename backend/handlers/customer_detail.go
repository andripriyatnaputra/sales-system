package handlers

import (
	"net/http"
	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func GetCustomer(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()

	var cust models.Customer

	err := database.Pool.QueryRow(ctx,
		`SELECT id, name, industry, region, created_at, updated_at
		 FROM customers WHERE id=$1`,
		id,
	).Scan(
		&cust.ID,
		&cust.Name,
		&cust.Industry,
		&cust.Region,
		&cust.CreatedAt,
		&cust.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer not found"})
		return
	}

	c.JSON(200, cust)
}
