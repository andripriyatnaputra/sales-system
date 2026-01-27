package handlers

import (
	"fmt"
	"sales-system-backend/database"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type UpdateRealizationRequest struct {
	Realization float64 `json:"realization"`
	ApplyMonth  string  `json:"apply_month"` // optional: YYYY-MM
	Move        bool    `json:"move"`        // optional
}

func isYYYYMM(v string) bool {
	return len(v) == 7 && v[4] == '-'
}

func UpdateRevenueRealization(c *gin.Context) {
	// --- Parse params ---
	projectIDStr := c.Param("id")

	projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project id"})
		return
	}

	sourceMonth := c.Param("month") // Must be YYYY-MM
	if !isYYYYMM(sourceMonth) {
		c.JSON(400, gin.H{"error": "invalid month format, expected YYYY-MM"})
		return
	}

	var body UpdateRealizationRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid payload"})
		return
	}

	applyMonth := strings.TrimSpace(body.ApplyMonth)
	if applyMonth == "" {
		applyMonth = sourceMonth
	}
	if !isYYYYMM(applyMonth) {
		c.JSON(400, gin.H{"error": "invalid apply_month format, expected YYYY-MM"})
		return
	}

	// ✅ FORCE MOVE: jika applyMonth beda, wajib pindah (clear source realization)
	// agar tidak pernah double count.
	if applyMonth != sourceMonth {
		body.Move = true
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
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(500, gin.H{"error": "tx begin failed"})
		return
	}
	defer tx.Rollback(ctx)

	// 1) Pastikan row bulan applyMonth ada (target default 0)
	_, err = tx.Exec(ctx, `
	INSERT INTO project_revenue_plan (project_id, month, target_revenue, target_realization)
	VALUES ($1, to_date($2 || '-01', 'YYYY-MM-DD'), 0, 0)
	ON CONFLICT (project_id, month) DO NOTHING
`, projectID, applyMonth)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("upsert revenue plan failed: %v", err)})
		return
	}

	// 2) Update realization di bulan aktual (applyMonth)
	_, err = tx.Exec(ctx, `
	UPDATE project_revenue_plan
	   SET target_realization = $1
	 WHERE project_id = $2
	   AND to_char(month, 'YYYY-MM') = $3
`, body.Realization, projectID, applyMonth)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("update failed: %v", err)})
		return
	}

	// 3) Clear realization di bulan asal jika pindah bulan (target tetap!)
	if applyMonth != sourceMonth {
		_, err = tx.Exec(ctx, `
		UPDATE project_revenue_plan
		   SET target_realization = 0
		 WHERE project_id = $1
		   AND to_char(month, 'YYYY-MM') = $2
	`, projectID, sourceMonth)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("clear source month failed: %v", err)})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(500, gin.H{"error": "tx commit failed"})
		return
	}

	c.JSON(200, gin.H{"status": "ok"})

}
