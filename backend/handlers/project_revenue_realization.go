package handlers

import (
	"fmt"
	"sales-system-backend/database"
	"strconv"

	"github.com/gin-gonic/gin"
)

type UpdateRealizationRequest struct {
	Realization float64 `json:"realization"`
}

func UpdateRevenueRealization(c *gin.Context) {
	// --- Parse params ---
	projectIDStr := c.Param("id")
	month := c.Param("month") // Must be YYYY-MM

	projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project id"})
		return
	}

	// Validate month format
	if len(month) != 7 || month[4] != '-' {
		c.JSON(400, gin.H{"error": "invalid month format, expected YYYY-MM"})
		return
	}

	var body UpdateRealizationRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid payload"})
		return
	}

	ctx := c.Request.Context()

	// --- ACL from token ---
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))

	// --- Fetch project division ---
	var projectDivision string
	err = database.Pool.QueryRow(ctx,
		`SELECT division FROM projects WHERE id = $1`,
		projectID,
	).Scan(&projectDivision)

	if err != nil {
		c.JSON(404, gin.H{"error": "project not found"})
		return
	}

	projectDivision = NormalizeDivision(projectDivision)

	// --- ACL Enforcement ---
	if role == "user" && userDivision != projectDivision {
		c.JSON(403, gin.H{
			"error": "forbidden: cannot update realization in another division",
		})
		return
	}

	// --- Update ---
	result, err := database.Pool.Exec(ctx, `
        UPDATE project_revenue_plan
           SET target_realization = $1
         WHERE project_id = $2
           AND to_char(month, 'YYYY-MM') = $3
    `,
		body.Realization,
		projectID,
		month,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("update failed: %v", err)})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(404, gin.H{"error": "revenue plan not found"})
		return
	}

	c.JSON(200, gin.H{"status": "ok"})
}
