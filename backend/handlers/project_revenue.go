package handlers

import (
	"sales-system-backend/database"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetRevenuePlan(c *gin.Context) {
	// --- Parse project ID ---
	projectIDStr := c.Param("id")
	projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project id"})
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
			"error": "forbidden: cannot view revenue in another division",
		})
		return
	}

	// --- Fetch revenue rows ---
	rows, err := database.Pool.Query(ctx, `
        SELECT 
            to_char(month, 'YYYY-MM') AS month,
            target_revenue,
            COALESCE(target_realization, 0) AS target_realization
        FROM project_revenue_plan
        WHERE project_id = $1
        ORDER BY month ASC
    `, projectID)

	if err != nil {
		c.JSON(500, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	var result []RevenuePlanItem

	for rows.Next() {
		var item RevenuePlanItem
		if err := rows.Scan(
			&item.Month,
			&item.TargetRevenue,
			&item.TargetRealization,
		); err == nil {
			result = append(result, item)
		}
	}

	c.JSON(200, result)
}
