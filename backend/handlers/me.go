package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	division, _ := c.Get("division")
	readOnly, _ := c.Get("read_only")

	c.JSON(http.StatusOK, gin.H{
		"id":        userID,
		"role":      role,
		"division":  division,
		"read_only": readOnly,
	})
}
