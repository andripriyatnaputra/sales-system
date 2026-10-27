package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// BlockExecutiveWrites keeps Executive accounts read-oriented. The only
// mutating exception is an explicit approval decision assigned to that user.
// Business data entry remains the responsibility of the operating roles.
func BlockExecutiveWrites() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("level") != "executive" || isSafeMethod(c.Request.Method) || isApprovalDecision(c) {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "executive hanya dapat membaca data atau memproses approval yang ditugaskan"})
		c.Abort()
	}
}

func isSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func isApprovalDecision(c *gin.Context) bool {
	if c.Request.Method != http.MethodPost {
		return false
	}
	path := strings.TrimSuffix(c.Request.URL.Path, "/")
	return strings.HasPrefix(path, "/api/approvals/") &&
		(strings.HasSuffix(path, "/approve") || strings.HasSuffix(path, "/reject"))
}
