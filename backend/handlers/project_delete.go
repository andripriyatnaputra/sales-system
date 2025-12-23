package handlers

import (
	"net/http"
	"sales-system-backend/database"
	"strconv"

	"github.com/gin-gonic/gin"
)

func DeleteProject(c *gin.Context) {
	// --- Parse project ID ---
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	ctx := c.Request.Context()

	// --- ACL from JWT ---
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))

	// --- Ambil division project ---
	var projectDivision string
	err = database.Pool.QueryRow(ctx,
		`SELECT division FROM projects WHERE id = $1`,
		id,
	).Scan(&projectDivision)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	projectDivision = NormalizeDivision(projectDivision)

	// --- ACL for user ---
	if role == "user" {
		if userDivision == "" || userDivision != projectDivision {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "forbidden: cannot delete project in another division",
			})
			return
		}
	}

	// --- Delete project ---
	cmdTag, err := database.Pool.Exec(ctx,
		`DELETE FROM projects WHERE id = $1`,
		id,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": "failed to delete project"})
		return
	}

	if cmdTag.RowsAffected() == 0 {
		c.JSON(404, gin.H{"error": "project not found"})
		return
	}

	c.Status(204)
}
