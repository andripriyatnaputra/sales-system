package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	role, _ := c.Get("role")
	division, _ := c.Get("division")
	department, _ := c.Get("department")
	orgUnit, _ := c.Get("org_unit")
	permissions, _ := c.Get("permissions")
	readOnly, _ := c.Get("read_only")

	c.JSON(http.StatusOK, gin.H{
		"id":          userID,
		"role":        role,
		"division":    division,
		"department":  department,
		"org_unit":    orgUnit,
		"permissions": permissions,
		"read_only":   readOnly,
	})
}
