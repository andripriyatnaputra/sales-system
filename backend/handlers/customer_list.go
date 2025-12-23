package handlers

import (
	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func GetCustomers(c *gin.Context) {
	ctx := c.Request.Context()

	rows, err := database.Pool.Query(ctx,
		`SELECT id, name, industry, region, created_at, updated_at
		 FROM customers
		 ORDER BY name ASC`,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	var list []models.Customer

	for rows.Next() {
		var cust models.Customer
		rows.Scan(
			&cust.ID,
			&cust.Name,
			&cust.Industry,
			&cust.Region,
			&cust.CreatedAt,
			&cust.UpdatedAt,
		)
		list = append(list, cust)
	}

	c.JSON(200, list)
}
