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

	// --- ACL: cuma Sales/admin yang boleh delete project ---
	if !canManageProjectCore(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: only Sales can delete project"})
		return
	}

	// --- ACL from JWT ---
	userDivision := NormalizeDivision(c.GetString("division"))

	// --- Ambil division project ---
	var projectDivision, projectCode string
	err = database.Pool.QueryRow(ctx,
		`SELECT division, project_code FROM projects WHERE id = $1`,
		id,
	).Scan(&projectDivision, &projectCode)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	projectDivision = NormalizeDivision(projectDivision)

	// --- ACL for user ---
	if isSalesDivisionLocked(c) {
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

	LogAudit(c, c.GetInt64("user_id"), "delete", "project", idStr, projectCode, nil)

	c.Status(204)
}
