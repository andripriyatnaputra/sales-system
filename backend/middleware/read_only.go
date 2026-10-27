package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// BlockReadOnly prevents read-only accounts from changing state. GET/HEAD
// requests remain available for dashboards and reporting.
func BlockReadOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		readOnly, _ := c.Get("read_only")
		if isReadOnly, ok := readOnly.(bool); ok && isReadOnly {
			c.JSON(http.StatusForbidden, gin.H{"error": "akun read-only tidak dapat mengubah data"})
			c.Abort()
			return
		}
		c.Next()
	}
}
