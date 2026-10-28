package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// These endpoint classes represent every protected mutation family in
// routes.go. The test deliberately stops at BlockReadOnly, so no real handler
// or database is invoked. Live endpoint testing must use an isolated staging
// dataset or a safe mock server, not production-like records.
func TestBlockReadOnlyRejectsProtectedMutationClasses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	paths := []string{
		"/api/users", "/api/org-units", "/api/roles", "/api/approval-matrices",
		"/api/approvals/1/approve", "/api/notifications/read-all",
		"/api/projects", "/api/projects/1", "/api/projects/1/documents",
		"/api/projects/1/presales-analysis/prodev", "/api/projects/1/boq-items",
		"/api/sales-orders/1/customer-pos", "/api/purchase-requests",
		"/api/purchase-orders", "/api/purchase-orders/1/payment-schedules",
		"/api/billing-requests", "/api/invoices", "/api/bast-vendor",
		"/api/bast-customer", "/api/customers", "/api/work-requests",
		"/api/vendors", "/api/budgets", "/api/budgets/1/realizations",
		"/api/chart-of-accounts", "/api/journal-entries", "/api/item-catalog",
	}
	methods := []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}

	for _, method := range methods {
		for _, path := range paths {
			t.Run(method+" "+path, func(t *testing.T) {
				r := gin.New()
				r.Use(func(c *gin.Context) {
					c.Set("read_only", true)
					c.Next()
				})
				r.Any("/*path", BlockReadOnly(), func(c *gin.Context) {
					t.Fatal("read-only request reached a mutating handler")
				})

				req := httptest.NewRequest(method, path, nil)
				res := httptest.NewRecorder()
				r.ServeHTTP(res, req)
				if res.Code != http.StatusForbidden {
					t.Fatalf("expected %d, got %d", http.StatusForbidden, res.Code)
				}
			})
		}
	}
}

func TestBlockReadOnlyAllowsSafeMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		r := gin.New()
		r.Use(func(c *gin.Context) {
			c.Set("read_only", true)
			c.Next()
		})
		r.Any("/*path", BlockReadOnly(), func(c *gin.Context) { c.Status(http.StatusNoContent) })

		req := httptest.NewRequest(method, "/api/projects/1", nil)
		res := httptest.NewRecorder()
		r.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("%s expected %d, got %d", method, http.StatusNoContent, res.Code)
		}
	}
}
