package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func accessContext(role, roleKey, level, department string) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("role", role)
	c.Set("role_key", roleKey)
	c.Set("level", level)
	c.Set("department", department)
	return c
}

func TestRequireDepartmentDoesNotTreatExecutiveAsSystemAdmin(t *testing.T) {
	if requireDepartment(accessContext("admin", "executive", "executive", "Sales"), "Finance") {
		t.Fatal("executive must not bypass department access")
	}
	if !requireDepartment(accessContext("admin", "system_admin", "system_admin", ""), "Finance") {
		t.Fatal("system admin should bypass department access")
	}
}

func TestCanManageProjectCoreUsesSystemAdminOrSalesScope(t *testing.T) {
	if canManageProjectCore(accessContext("admin", "executive", "executive", "Sales")) {
		t.Fatal("executive must not receive project write access from legacy admin role")
	}
	if !canManageProjectCore(accessContext("user", "sales_it_solutions_manager", "manager", "Sales")) {
		t.Fatal("Sales users should manage project core data")
	}
	if !canManageProjectCore(accessContext("admin", "system_admin", "system_admin", "")) {
		t.Fatal("system admin should manage project core data")
	}
}
