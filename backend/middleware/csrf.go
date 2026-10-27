package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/gin-gonic/gin"
)

const csrfCookieName = "sales_csrf"

// CSRFProtection applies a double-submit cookie check to state-changing API
// requests. The CSRF cookie is readable by the frontend, while the session
// cookie remains HttpOnly. SameSite is an additional browser-level defense.
func CSRFProtection() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			c.Next()
			return
		}

		cookieToken, err := c.Cookie(csrfCookieName)
		headerToken := c.GetHeader("X-CSRF-Token")
		if err != nil || cookieToken == "" || headerToken == "" ||
			subtle.ConstantTimeCompare([]byte(cookieToken), []byte(headerToken)) != 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid CSRF token"})
			c.Abort()
			return
		}

		c.Next()
	}
}
