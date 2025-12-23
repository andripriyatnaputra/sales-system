package handlers

import (
	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func UpdateCustomer(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Name     *string `json:"name"`
		Industry *string `json:"industry"`
		Region   *string `json:"region"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	_, err := database.Pool.Exec(c, `
		UPDATE customers
		SET 
			name = COALESCE($1, name),
			industry = COALESCE($2, industry),
			region = COALESCE($3, region),
			updated_at = NOW()
		WHERE id=$4
	`, body.Name, body.Industry, body.Region, id)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "updated"})
}
