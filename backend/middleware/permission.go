package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequirePermission menolak request kecuali user punya permission key tertentu
// di JWT claims (diisi saat login dari role_permissions). Dipakai untuk endpoint
// baru (approval, PR/PO, dst) ke depan -- AdminOnly() lama dibiarkan tetap
// dipakai endpoint existing supaya tidak ada perubahan perilaku di luar scope ini.
func RequirePermission(key string) gin.HandlerFunc {
	return func(c *gin.Context) {
		permsRaw, exists := c.Get("permissions")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: no permissions on token"})
			c.Abort()
			return
		}

		perms, ok := permsRaw.([]string)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: invalid permissions claim"})
			c.Abort()
			return
		}

		for _, p := range perms {
			if p == key {
				c.Next()
				return
			}
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: missing permission " + key})
		c.Abort()
	}
}
