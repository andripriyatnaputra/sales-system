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
		var roleKey, department, level, orgUnit string
		if err := database.Pool.QueryRow(c.Request.Context(), `
			SELECT u.role, u.division, u.read_only,
			       COALESCE(r.key, ''),
			       COALESCE(d.name, ou_dept.name, ''),
			       COALESCE(r.level, ''),
			       COALESCE(ou.name, '')
			FROM users u
			LEFT JOIN roles r ON r.id = u.role_id
			LEFT JOIN departments d ON d.id = r.department_id
			LEFT JOIN org_units ou ON ou.id = r.org_unit_id
			LEFT JOIN departments ou_dept ON ou_dept.id = ou.department_id
			WHERE u.id = $1
		`, userID).Scan(&role, &division, &readOnly, &roleKey, &department, &level, &orgUnit); err != nil {
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

		// Authorization context is read from the current database state rather
		// than copied from the JWT. Role/department/permission changes therefore
		// take effect immediately, without waiting for token expiry.
		permissions := make([]string, 0)
		rows, err := database.Pool.Query(c.Request.Context(), `
			SELECT p.key
			FROM role_permissions rp
			JOIN permissions p ON p.id = rp.permission_id
			JOIN users u ON u.role_id = rp.role_id
			WHERE u.id = $1
		`, userID)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "authorization service unavailable"})
			c.Abort()
			return
		}
		for rows.Next() {
			var permission string
			if err := rows.Scan(&permission); err != nil {
				rows.Close()
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "authorization service unavailable"})
				c.Abort()
				return
			}
			permissions = append(permissions, permission)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "authorization service unavailable"})
			c.Abort()
			return
		}
		rows.Close()

		c.Set("role_key", roleKey)
		c.Set("department", department)
		c.Set("level", level)
		c.Set("org_unit", orgUnit)
		c.Set("permissions", permissions)

		c.Next()
	}
}
