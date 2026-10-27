package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestLoginRateLimitBlocksAfterMaximum(t *testing.T) {
	loginAttempts.Lock()
	loginAttempts.byIP = make(map[string][]time.Time)
	loginAttempts.Unlock()

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(LoginRateLimit())
	r.POST("/login", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	for i := 0; i < loginRateLimitMax; i++ {
		req := httptest.NewRequest(http.MethodPost, "/login", nil)
		req.RemoteAddr = "192.0.2.10:1234"
		res := httptest.NewRecorder()
		r.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d: expected %d, got %d", i+1, http.StatusNoContent, res.Code)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("expected %d, got %d", http.StatusTooManyRequests, res.Code)
	}
}
