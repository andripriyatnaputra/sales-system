package middleware

import (
	"net/http"
	"strings"

	"sales-system-backend/handlers"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(auth, "Bearer ")

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			return handlers.JwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			c.Abort()
			return
		}

		role := claims["role"].(string)
		division := claims["division"].(string)
		userID := int64(claims["user_id"].(float64))

		readOnly, _ := claims["read_only"].(bool)

		division = handlers.NormalizeDivision(division)

		c.Set("role", role)
		c.Set("division", division)
		c.Set("user_id", userID)
		c.Set("read_only", readOnly)

		c.Next()
	}
}

// BlockReadOnly rejects any mutating request (anything but GET) coming from
// a read-only account. Read-only accounts exist purely for sharing dashboards
// with people outside the team, so they must never be able to write data
// even if the frontend happens to expose a button for it.
func BlockReadOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		readOnly, _ := c.Get("read_only")

		if ro, ok := readOnly.(bool); ok && ro && c.Request.Method != http.MethodGet {
			c.JSON(http.StatusForbidden, gin.H{"error": "read-only account: write access is disabled"})
			c.Abort()
			return
		}

		c.Next()
	}
}
