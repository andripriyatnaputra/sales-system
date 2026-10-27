package middleware

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/handlers"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
)

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		tokenString := ""
		if auth != "" {
			if !strings.HasPrefix(auth, "Bearer ") {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
				c.Abort()
				return
			}
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
		if tokenString == "" {
			cookieToken, cookieErr := c.Cookie("sales_session")
			if cookieErr == nil {
				tokenString = cookieToken
			}
		}
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if t.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return handlers.GetJWTSecret()
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

		userIDValue, ok := claims["user_id"].(float64)
		if !ok || userIDValue <= 0 || math.Trunc(userIDValue) != userIDValue {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token user id"})
			c.Abort()
			return
		}
		userID := int64(userIDValue)

		// Claims are not the source of truth for authorization. Re-read the
		// current user record so deleted users and changed role/division/read-only
		// settings take effect immediately instead of waiting for token expiry.
		var role, division string
		var readOnly bool
		if err := database.Pool.QueryRow(c.Request.Context(), `
			SELECT role, division, read_only
			FROM users
			WHERE id = $1
		`, userID).Scan(&role, &division, &readOnly); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "user is no longer active"})
			} else {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "authentication service unavailable"})
			}
			c.Abort()
			return
		}
		division = handlers.NormalizeDivision(division)

		c.Set("role", role)
		c.Set("division", division)
		c.Set("user_id", userID)
		c.Set("read_only", readOnly)

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
