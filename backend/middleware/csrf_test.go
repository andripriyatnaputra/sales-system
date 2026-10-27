package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCSRFProtectionAllowsSafeMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CSRFProtection())
	r.GET("/resource", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodGet, "/resource", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, res.Code)
	}
}

func TestCSRFProtectionRejectsMissingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CSRFProtection())
	r.POST("/resource", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodPost, "/resource", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected %d, got %d", http.StatusForbidden, res.Code)
	}
}

func TestCSRFProtectionAllowsMatchingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CSRFProtection())
	r.POST("/resource", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodPost, "/resource", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "test-token"})
	req.Header.Set("X-CSRF-Token", "test-token")
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, res.Code)
	}
}
