package handlers

import (
	"net/http"
	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func ListUsers(c *gin.Context) {
	role := c.GetString("role")

	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin only"})
		return
	}

	rows, err := database.Pool.Query(c, `
		SELECT id, username, role, division, created_at, updated_at
		FROM users
		ORDER BY id
	`)
	if err != nil {
		c.JSON(500, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	users := []models.User{}

	for rows.Next() {
		var u models.User
		err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.Division, &u.CreatedAt, &u.UpdatedAt)
		if err == nil {
			users = append(users, u)
		}
	}

	c.JSON(http.StatusOK, users)
}
