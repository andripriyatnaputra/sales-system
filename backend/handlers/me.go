package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	role, _ := c.Get("role")
	division, _ := c.Get("division")

	c.JSON(http.StatusOK, gin.H{
		"id":       userID,
		"role":     role,
		"division": division,
	})
}
