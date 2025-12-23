package handlers

import (
	"fmt"
	"net/http"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Division string `json:"division"`
}

func Login(c *gin.Context) {
	var req LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Println("JSON Bind Error:", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	fmt.Printf("REQ BODY: username=%q password=%q\n", req.Username, req.Password)

	ctx := c.Request.Context()

	var user models.User
	err := database.Pool.QueryRow(ctx,
		`SELECT id, username, password_hash, role, division
         FROM users
         WHERE username = $1`,
		req.Username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role, &user.Division)

	if err != nil {
		c.JSON(401, gin.H{"error": "invalid username/password"})
		return
	}

	if !CheckPassword(req.Password, user.PasswordHash) {
		c.JSON(401, gin.H{"error": "invalid username/password"})
		return
	}

	user.Division = NormalizeDivision(user.Division)

	claims := jwt.MapClaims{
		"user_id":  user.ID,
		"role":     user.Role,
		"division": user.Division,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(JwtSecret)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to sign token"})
		return
	}

	c.JSON(200, gin.H{
		"token":    signed,
		"role":     user.Role,
		"division": user.Division,
		"username": user.Username,
	})
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
