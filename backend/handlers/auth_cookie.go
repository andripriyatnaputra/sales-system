package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const authCookieName = "sales_session"
const csrfCookieName = "sales_csrf"

func authCookieSecure() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("AUTH_COOKIE_SECURE")), "true")
}

func SetAuthCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		authCookieName,
		token,
		24*60*60,
		"/",
		"",
		authCookieSecure(),
		true,
	)
}

func SetCSRFCookie(c *gin.Context) error {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return err
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		csrfCookieName,
		hex.EncodeToString(bytes),
		24*60*60,
		"/",
		"",
		authCookieSecure(),
		false,
	)
	return nil
}

func ClearAuthCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(authCookieName, "", -1, "/", "", authCookieSecure(), true)
	c.SetCookie(csrfCookieName, "", -1, "/", "", authCookieSecure(), false)
}

func Logout(c *gin.Context) {
	ClearAuthCookie(c)
	c.Status(http.StatusNoContent)
}
