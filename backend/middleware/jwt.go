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

		division = handlers.NormalizeDivision(division)

		c.Set("role", role)
		c.Set("division", division)
		c.Set("user_id", userID)

		// Claims RBAC tambahan (additive) -- token lama tanpa claims ini masih
		// bisa lolos, cukup diperlakukan sebagai role_key/department/level kosong
		// dan permissions kosong (RequirePermission akan menolak, bukan panic).
		if roleKey, ok := claims["role_key"].(string); ok {
			c.Set("role_key", roleKey)
		}
		if department, ok := claims["department"].(string); ok {
			c.Set("department", department)
		}
		if level, ok := claims["level"].(string); ok {
			c.Set("level", level)
		}
		if orgUnit, ok := claims["org_unit"].(string); ok {
			c.Set("org_unit", orgUnit)
		}
		if permsRaw, ok := claims["permissions"].([]interface{}); ok {
			perms := make([]string, 0, len(permsRaw))
			for _, p := range permsRaw {
				if s, ok := p.(string); ok {
					perms = append(perms, s)
				}
			}
			c.Set("permissions", perms)
		}

		c.Next()
	}
}
