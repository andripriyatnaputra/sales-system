package handlers

import (
	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func CreateCustomer(c *gin.Context) {
	var body struct {
		Name     string `json:"name"`
		Industry string `json:"industry"`
		Region   string `json:"region"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO customers (name, industry, region)
		VALUES ($1, $2, $3)
		RETURNING id
	`, body.Name, body.Industry, body.Region).Scan(&id)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"id": id})
}
