package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role_key") != "system_admin" && c.GetString("level") != "system_admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "system admin only"})
			c.Abort()
			return
		}

		c.Next()
	}
}
