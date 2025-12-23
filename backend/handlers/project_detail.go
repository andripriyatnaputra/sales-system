package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

type RevenuePlanItem struct {
	Month             string  `json:"month"`
	TargetRevenue     float64 `json:"target_revenue"`
	TargetRealization float64 `json:"target_realization"`
}

type ProjectDetailResponse struct {
	models.Project
	CustomerName     string                          `json:"customer_name,omitempty"`
	RevenuePlans     []RevenuePlanItem               `json:"revenue_plans"`
	PostPOMonitoring *models.ProjectPostPOMonitoring `json:"postpo_monitoring,omitempty"`
}

func mustAtoi64(s string) int64 {
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		panic("mustAtoi64: invalid input '" + s + "'")
	}
	return v
}

func GetProject(c *gin.Context) {
	// --- Parse project ID ---
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	ctx := c.Request.Context()

	// --- Fetch base project info ---
	var p models.Project
	var customerName string

	err = database.Pool.QueryRow(ctx, `
		SELECT 
			p.id,
			p.project_code,
			p.description,
			p.customer_id,
			COALESCE(c.name, '') AS customer_name,
			p.division,
			p.status,
			p.project_type,
			p.sph_status,
			p.sph_release_date,
			p.sales_stage,
			p.sph_release_status,
			p.sph_number,
			p.created_at,
			p.updated_at
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		WHERE p.id = $1
	`, id).Scan(
		&p.ID,
		&p.ProjectCode,
		&p.Description,
		&p.CustomerID,
		&customerName,
		&p.Division,
		&p.Status,
		&p.ProjectType,
		&p.SPHStatus,
		&p.SPHRelease,
		&p.SalesStage,
		&p.SPHReleaseStatus,
		&p.SPHNumber,
		&p.CreatedAt,
		&p.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	// --- ACL ENFORCEMENT ---
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))
	projectDivision := NormalizeDivision(p.Division)

	if role == "user" {
		if userDivision == "" || userDivision != projectDivision {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "forbidden: cannot access project in another division",
			})
			return
		}
	}

	// --- Fetch revenue plans ---
	rows, err := database.Pool.Query(ctx, `
		SELECT 
			to_char(month, 'YYYY-MM') AS month,
			target_revenue,
			COALESCE(target_realization, 0) AS target_realization
		FROM project_revenue_plan
		WHERE project_id = $1
		ORDER BY month ASC
	`, id)

	if err != nil {
		c.JSON(500, gin.H{"error": "revenue query error"})
		return
	}
	defer rows.Close()

	var plans []RevenuePlanItem
	for rows.Next() {
		var item RevenuePlanItem
		if err := rows.Scan(
			&item.Month,
			&item.TargetRevenue,
			&item.TargetRealization,
		); err == nil {
			plans = append(plans, item)
		}
	}

	// --- Ensure Post-PO monitoring row exists (UPSERT) ---
	// Supaya frontend selalu dapat object default
	_, _ = database.Pool.Exec(ctx, `
		INSERT INTO project_postpo_monitoring(project_id)
		VALUES($1)
		ON CONFLICT(project_id) DO NOTHING
	`, id)

	// --- Fetch Post-PO monitoring ---
	var mon models.ProjectPostPOMonitoring
	monErr := database.Pool.QueryRow(ctx, `
		SELECT
			project_id,
			stage1_status, stage2_status, stage3_status, stage4_status, stage5_status,
			stage1_date, stage2_date, stage3_date, stage4_date, stage5_date,
			stage1_note, stage2_note, stage3_note, stage4_note, stage5_note,
			updated_at
		FROM project_postpo_monitoring
		WHERE project_id = $1
	`, id).Scan(
		&mon.ProjectID,
		&mon.Stage1Status, &mon.Stage2Status, &mon.Stage3Status, &mon.Stage4Status, &mon.Stage5Status,
		&mon.Stage1Date, &mon.Stage2Date, &mon.Stage3Date, &mon.Stage4Date, &mon.Stage5Date,
		&mon.Stage1Note, &mon.Stage2Note, &mon.Stage3Note, &mon.Stage4Note, &mon.Stage5Note,
		&mon.UpdatedAt,
	)

	// --- Response ---
	resp := ProjectDetailResponse{
		Project:      p,
		CustomerName: customerName,
		RevenuePlans: plans,
	}

	if monErr == nil {
		resp.PostPOMonitoring = &mon
	}

	c.JSON(200, resp)
}

func UpdatePostPOMonitoring(c *gin.Context) {
	projectID := mustAtoi64(c.Param("id"))
	ctx := c.Request.Context()

	// ACL sama seperti GetProject: pastikan user hanya update project divisinya
	// (idealnya refactor ACL check jadi helper)
	var projectDivision string
	err := database.Pool.QueryRow(ctx, `SELECT division FROM projects WHERE id=$1`, projectID).Scan(&projectDivision)
	if err != nil {
		c.JSON(404, gin.H{"error": "project not found"})
		return
	}
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))
	if role == "user" && (userDivision == "" || NormalizeDivision(projectDivision) != userDivision) {
		c.JSON(403, gin.H{"error": "forbidden"})
		return
	}

	var salesStage int
	_ = database.Pool.QueryRow(ctx,
		`SELECT sales_stage FROM projects WHERE id=$1`, projectID).
		Scan(&salesStage)

	if salesStage < 6 {
		c.JSON(400, gin.H{
			"error": "post-PO monitoring allowed only after sales stage = Closing",
		})
		return
	}

	var body struct {
		Stage  int     `json:"stage"`
		Status string  `json:"status"`
		Date   *string `json:"date"` // YYYY-MM-DD or null
		Note   *string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if body.Stage < 1 || body.Stage > 5 {
		c.JSON(400, gin.H{"error": "stage must be 1..5"})
		return
	}
	if body.Status != "Not Started" && body.Status != "In Progress" && body.Status != "Done" {
		c.JSON(400, gin.H{"error": "invalid status"})
		return
	}

	// upsert row kalau belum ada
	_, _ = database.Pool.Exec(ctx, `
		INSERT INTO project_postpo_monitoring(project_id)
		VALUES($1)
		ON CONFLICT(project_id) DO NOTHING
	`, projectID)

	statusCol := fmt.Sprintf("stage%d_status", body.Stage)
	dateCol := fmt.Sprintf("stage%d_date", body.Stage)
	noteCol := fmt.Sprintf("stage%d_note", body.Stage)

	q := fmt.Sprintf(`
		UPDATE project_postpo_monitoring
		SET %s=$1, %s=$2, %s=$3, updated_at=now()
		WHERE project_id=$4
	`, statusCol, dateCol, noteCol)

	var dateVal any = nil
	if body.Date != nil && *body.Date != "" {
		dateVal = *body.Date
	}

	_, err = database.Pool.Exec(ctx, q, body.Status, dateVal, body.Note, projectID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"ok": true})
}
