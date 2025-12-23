package handlers

import (
	"net/http"
	"sales-system-backend/database"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func CreateUser(c *gin.Context) {
	// Only admin can create user
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin only"})
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Division string `json:"division"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	// Validate input
	if strings.TrimSpace(req.Username) == "" {
		c.JSON(400, gin.H{"error": "username is required"})
		return
	}
	if strings.TrimSpace(req.Password) == "" {
		c.JSON(400, gin.H{"error": "password is required"})
		return
	}
	if req.Role != "admin" && req.Role != "user" {
		c.JSON(400, gin.H{"error": "invalid role"})
		return
	}
	if strings.TrimSpace(req.Division) == "" {
		c.JSON(400, gin.H{"error": "division is required"})
		return
	}

	// Normalize division to match your DB usage
	normalizedDivision := NormalizeDivision(req.Division)

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to hash password"})
		return
	}

	// Insert into DB
	var id int64
	err = database.Pool.QueryRow(
		c,
		`
		INSERT INTO users (username, password_hash, role, division)
		VALUES ($1, $2, $3, $4)
		RETURNING id
		`,
		req.Username,
		string(hash),
		req.Role,
		normalizedDivision,
	).Scan(&id)

	if err != nil {
		// Check duplicate username
		if strings.Contains(err.Error(), "users_username_key") {
			c.JSON(409, gin.H{"error": "username already exists"})
			return
		}

		c.JSON(500, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(201, gin.H{
		"id":       id,
		"username": req.Username,
		"role":     req.Role,
		"division": normalizedDivision,
	})
}
