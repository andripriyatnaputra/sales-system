package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAdminOnlyRejectsExecutiveLegacyAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("role", "admin")
		c.Set("role_key", "executive")
		c.Set("level", "executive")
		c.Next()
	})
	r.GET("/restricted", AdminOnly(), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodGet, "/restricted", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected %d, got %d", http.StatusForbidden, res.Code)
	}
}

func TestAdminOnlyAllowsSystemAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("role", "admin")
		c.Set("role_key", "system_admin")
		c.Set("level", "system_admin")
		c.Next()
	})
	r.GET("/restricted", AdminOnly(), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodGet, "/restricted", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, res.Code)
	}
}
