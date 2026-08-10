package handlers

import (
	"sales-system-backend/database"
	"strconv"

	"github.com/gin-gonic/gin"
)

func DeleteUser(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	// Optional: prevent admin from deleting itself
	userID := c.GetInt64("user_id")
	if id == userID {
		c.JSON(400, gin.H{"error": "cannot delete yourself"})
		return
	}

	var deletedUsername string
	_ = database.Pool.QueryRow(c, `SELECT username FROM users WHERE id=$1`, id).Scan(&deletedUsername)

	result, err := database.Pool.Exec(c, `DELETE FROM users WHERE id=$1`, id)
	if err != nil {
		c.JSON(500, gin.H{"error": "delete failed"})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(404, gin.H{"error": "user not found"})
		return
	}

	LogAudit(c, userID, "delete", "user", strconv.FormatInt(id, 10), deletedUsername, nil)

	c.JSON(200, gin.H{"status": "deleted"})
}
