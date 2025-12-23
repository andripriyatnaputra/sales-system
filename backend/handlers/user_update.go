package handlers

import (
	"net/http"
	"sales-system-backend/database"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func UpdateUser(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin only"})
		return
	}

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	var req struct {
		Username string  `json:"username"`
		Password *string `json:"password"`
		Role     string  `json:"role"`
		Division string  `json:"division"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	// Hash password only if provided
	var passwordHash *string
	if req.Password != nil && *req.Password != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		h := string(hash)
		passwordHash = &h
	}

	// Build dynamic update query
	if passwordHash != nil {
		_, err := database.Pool.Exec(c, `
			UPDATE users
			   SET username=$1, password_hash=$2, role=$3, division=$4, updated_at=NOW()
			 WHERE id=$5
		`, req.Username, *passwordHash, req.Role, NormalizeDivision(req.Division), id)

		if err != nil {
			c.JSON(500, gin.H{"error": "update failed"})
			return
		}
	} else {
		_, err := database.Pool.Exec(c, `
			UPDATE users
			   SET username=$1, role=$2, division=$3, updated_at=NOW()
			 WHERE id=$4
		`, req.Username, req.Role, NormalizeDivision(req.Division), id)

		if err != nil {
			c.JSON(500, gin.H{"error": "update failed"})
			return
		}
	}

	c.JSON(200, gin.H{"status": "ok"})
}
