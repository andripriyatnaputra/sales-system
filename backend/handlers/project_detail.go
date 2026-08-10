package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

type RevenuePlanItem struct {
	Month             string   `json:"month"`
	TargetRevenue     float64  `json:"target_revenue"`
	SPHRevenue        *float64 `json:"sph_revenue,omitempty"`
	TargetRealization float64  `json:"target_realization"`
}

type ProjectDetailResponse struct {
	models.Project
	CustomerName      string                          `json:"customer_name,omitempty"`
	ProdevOrgUnitName string                          `json:"prodev_org_unit_name,omitempty"`
	RevenuePlans      []RevenuePlanItem               `json:"revenue_plans"`
	PostPOMonitoring  *models.ProjectPostPOMonitoring `json:"postpo_monitoring,omitempty"`
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
	var prodevOrgUnitName string

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
			COALESCE(p.pipeline_status, 'Active') AS pipeline_status,
			p.sph_status,
			p.sph_release_date,
			p.sales_stage,
			p.sph_release_status,
			p.sph_number,
			p.sph_status_reason_category,
			p.sph_status_reason_note,
			p.ops_team,
			p.ops_handover_date,
			p.documents_complete_at,
			p.prodev_org_unit_id,
			COALESCE(pou.name, '') AS prodev_org_unit_name,
			p.prodev_assigned_at,
			p.created_at,
			p.updated_at
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN org_units pou ON pou.id = p.prodev_org_unit_id
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
		&p.PipelineStatus,
		&p.SPHStatus,
		&p.SPHRelease,
		&p.SalesStage,
		&p.SPHReleaseStatus,
		&p.SPHNumber,
		&p.SPHStatusReasonCategory,
		&p.SPHStatusReasonNote,
		&p.OpsTeam,
		&p.OpsHandoverDate,
		&p.DocumentsCompleteAt,
		&p.ProdevOrgUnitID,
		&prodevOrgUnitName,
		&p.ProdevAssignedAt,
		&p.CreatedAt,
		&p.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	// --- ACL ENFORCEMENT ---
	userDivision := NormalizeDivision(c.GetString("division"))
	projectDivision := NormalizeDivision(p.Division)

	if isSalesDivisionLocked(c) {
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
		Project:           p,
		CustomerName:      customerName,
		ProdevOrgUnitName: prodevOrgUnitName,
		RevenuePlans:      plans,
	}

	if monErr == nil {
		resp.PostPOMonitoring = &mon
	}

	c.JSON(200, resp)
}

func UpdatePostPOMonitoring(c *gin.Context) {
	projectID := mustAtoi64(c.Param("id"))
	ctx := c.Request.Context()

	// Post-PO monitoring = pekerjaan eksekusi pasca-PO, milik Operations --
	// gate department (pola sama bast_vendor.go), BUKAN division-lock lagi.
	if !requireDepartment(c, "Operations") {
		c.JSON(403, gin.H{"error": "forbidden: hanya Operations yang bisa update post-PO monitoring"})
		return
	}

	var salesStage int
	err := database.Pool.QueryRow(ctx,
		`SELECT sales_stage FROM projects WHERE id=$1`, projectID).
		Scan(&salesStage)
	if err != nil {
		c.JSON(404, gin.H{"error": "project not found"})
		return
	}

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

	LogAudit(c, c.GetInt64("user_id"), "update", "project_postpo_monitoring", strconv.FormatInt(projectID, 10), fmt.Sprintf("stage %d: %s", body.Stage, body.Status), body)

	c.JSON(200, gin.H{"ok": true})
}

// postpoStageRank: urutan progres Not Started < In Progress < Done -- dipakai
// maybeAdvancePostPOStage supaya auto-advance TIDAK PERNAH menurunkan status
// yang sudah lebih maju (mis. sudah manual di-set Done, event BAST/Invoice
// belakangan tidak boleh menimpa jadi status yang lebih rendah).
func postpoStageRank(status string) int {
	switch status {
	case "Done":
		return 2
	case "In Progress":
		return 1
	default:
		return 0
	}
}

// maybeAdvancePostPOStage: auto-advance 1 tahap Post-PO Monitoring sbg efek
// samping dari event ASLI (BAST Customer dibuat / Invoice dikirim) -- HANYA
// utk Stage 4 (Goods Receipt/Service Acceptance, dari bast_customer) & Stage 5
// (Invoice Submission, dari invoices), krn cuma 2 tahap ini yang punya entity
// asli di sistem. Pola PERSIS maybeHandoverToManagedService (bast_customer.go)
// -- lookup project via sales_order_id, silent-fail total (gagal TIDAK
// membatalkan request pemanggil yang sudah sukses di atasnya), idempoten
// (anti-regresi via postpoStageRank), LogAudit kalau berhasil.
func maybeAdvancePostPOStage(ctx context.Context, salesOrderID int64, stage int, newStatus string, actorUserID int64) {
	var projectID int64
	err := database.Pool.QueryRow(ctx, `
		SELECT p.id FROM projects p JOIN sales_orders so ON so.project_id = p.id WHERE so.id = $1
	`, salesOrderID).Scan(&projectID)
	if err != nil {
		return
	}

	_, _ = database.Pool.Exec(ctx, `
		INSERT INTO project_postpo_monitoring(project_id) VALUES ($1) ON CONFLICT(project_id) DO NOTHING
	`, projectID)

	statusCol := fmt.Sprintf("stage%d_status", stage)
	dateCol := fmt.Sprintf("stage%d_date", stage)

	var currentStatus string
	err = database.Pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM project_postpo_monitoring WHERE project_id = $1`, statusCol), projectID).Scan(&currentStatus)
	if err != nil || postpoStageRank(newStatus) <= postpoStageRank(currentStatus) {
		return
	}

	_, err = database.Pool.Exec(ctx, fmt.Sprintf(`
		UPDATE project_postpo_monitoring SET %s = $1, %s = CURRENT_DATE, updated_at = NOW() WHERE project_id = $2
	`, statusCol, dateCol), newStatus, projectID)
	if err == nil {
		LogAudit(ctx, actorUserID, "auto-advance", "project_postpo_monitoring", strconv.FormatInt(projectID, 10),
			fmt.Sprintf("stage %d -> %s", stage, newStatus), nil)
	}
}
