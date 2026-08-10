package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// requireDepartment: true kalau user login berdepartemen sesuai yang dibutuhkan,
// atau bypass kalau dia system_admin (legacy role "admin"). Dipakai buat menjaga
// tiap bagian presales analysis cuma bisa diisi divisi yang berwenang (ProDev,
// Operations, Procurement, Finance) -- bukan permission generik karena ini soal
// "departemen mana", bukan "boleh akses modul atau tidak".
func requireDepartment(c *gin.Context, department string) bool {
	if c.GetString("role") == "admin" {
		return true
	}
	return c.GetString("department") == department
}

func getOrInitPresalesAnalysis(ctx context.Context, projectID int64) (*models.PresalesAnalysis, error) {
	pa, err := scanPresalesAnalysis(ctx, projectID)
	if err == nil {
		return pa, nil
	}

	_, err = database.Pool.Exec(ctx, `
		INSERT INTO presales_analyses (project_id) VALUES ($1)
		ON CONFLICT (project_id) DO NOTHING
	`, projectID)
	if err != nil {
		return nil, err
	}

	return scanPresalesAnalysis(ctx, projectID)
}

func scanPresalesAnalysis(ctx context.Context, projectID int64) (*models.PresalesAnalysis, error) {
	var pa models.PresalesAnalysis
	var projectCreatedAt time.Time
	err := database.Pool.QueryRow(ctx, `
		SELECT pa.id, pa.project_id, pa.solution_summary, pa.boq_status, pa.boq_submitted_at, pa.boq_approval_request_id,
		       pa.installation_cost_status, pa.installation_cost_estimate, pa.installation_cost_submitted_at,
		       pa.vendor_cost_status, pa.vendor_cost_estimate, pa.vendor_cost_submitted_at,
		       pa.pnl_status, pa.recommended_price, pa.pnl_submitted_at,
		       pa.overall_status, pa.approval_request_id, pa.created_at, pa.updated_at,
		       p.created_at
		FROM presales_analyses pa
		JOIN projects p ON p.id = pa.project_id
		WHERE pa.project_id = $1
	`, projectID).Scan(&pa.ID, &pa.ProjectID, &pa.SolutionSummary, &pa.BOQStatus, &pa.BOQSubmittedAt, &pa.BOQApprovalRequestID,
		&pa.InstallationCostStatus, &pa.InstallationCostEstimate, &pa.InstallationCostSubmittedAt,
		&pa.VendorCostStatus, &pa.VendorCostEstimate, &pa.VendorCostSubmittedAt,
		&pa.PnLStatus, &pa.RecommendedPrice, &pa.PnLSubmittedAt,
		&pa.OverallStatus, &pa.ApprovalRequestID, &pa.CreatedAt, &pa.UpdatedAt,
		&projectCreatedAt)
	if err != nil {
		return &pa, err
	}

	pa.BOQAgingDays = sectionAgingDays(pa.BOQStatus, projectCreatedAt, pa.BOQSubmittedAt)
	pa.InstallationCostAgingDays = sectionAgingDays(pa.InstallationCostStatus, projectCreatedAt, pa.InstallationCostSubmittedAt)
	pa.VendorCostAgingDays = sectionAgingDays(pa.VendorCostStatus, projectCreatedAt, pa.VendorCostSubmittedAt)
	pa.PnLAgingDays = sectionAgingDays(pa.PnLStatus, projectCreatedAt, pa.PnLSubmittedAt)

	return &pa, nil
}

// sectionAgingDays: bagian presales masih 'pending' -> hitung sampai NOW()
// (masih berjalan). Sudah 'submitted' tapi submittedAt nil -> data lama
// dari sebelum kolom ini ada, hasil nil (bukan 0 hari).
func sectionAgingDays(status string, start time.Time, submittedAt *time.Time) *int {
	if status == "submitted" {
		if submittedAt == nil {
			return nil
		}
		return daysBetween(&start, submittedAt)
	}
	return daysBetween(&start, nil)
}

// syncOverallStatusFromApproval: kalau overall_status masih 'pending_approval' dan
// sudah ada approval_request terkait, cek status approval terbaru dan sinkronkan.
// Lazy-sync, tidak pakai webhook/callback.
func syncOverallStatusFromApproval(ctx context.Context, pa *models.PresalesAnalysis) error {
	if pa.OverallStatus != "pending_approval" || pa.ApprovalRequestID == nil {
		return nil
	}
	ar, err := GetApprovalRequest(ctx, *pa.ApprovalRequestID)
	if err != nil {
		return err
	}
	if ar.Status == "approved" || ar.Status == "rejected" {
		_, err = database.Pool.Exec(ctx, `UPDATE presales_analyses SET overall_status = $1, updated_at = NOW() WHERE project_id = $2`, ar.Status, pa.ProjectID)
		if err != nil {
			return err
		}
		pa.OverallStatus = ar.Status
	}
	return nil
}

// syncBOQStatusFromApproval: kalau boq_status masih 'pending_approval' dan
// sudah ada boq_approval_request_id, cek keputusan manager terbaru dan
// sinkronkan -- lazy-sync, pola SAMA PERSIS syncOverallStatusFromApproval.
// approved -> boq_status jadi 'submitted' (boq_submitted_at terisi kalau
// belum) DAN recomputeOverallStatus dipanggil (baru sekarang bagian ini
// resmi "submitted" & ikut dihitung ke overall_status). rejected -> balik
// ke 'pending' (staff perbaiki & submit ulang -- bukan dead-end).
func syncBOQStatusFromApproval(ctx context.Context, pa *models.PresalesAnalysis) error {
	if pa.BOQStatus != "pending_approval" || pa.BOQApprovalRequestID == nil {
		return nil
	}
	ar, err := GetApprovalRequest(ctx, *pa.BOQApprovalRequestID)
	if err != nil {
		return err
	}
	if ar.Status != "approved" && ar.Status != "rejected" {
		return nil
	}

	if ar.Status == "approved" {
		_, err = database.Pool.Exec(ctx, `
			UPDATE presales_analyses SET boq_status = 'submitted',
			       boq_submitted_at = CASE WHEN boq_submitted_at IS NULL THEN NOW() ELSE boq_submitted_at END,
			       updated_at = NOW()
			WHERE project_id = $1
		`, pa.ProjectID)
		if err != nil {
			return err
		}
		pa.BOQStatus = "submitted"
		return recomputeOverallStatus(ctx, pa.ProjectID, ar.RequestedBy)
	}

	_, err = database.Pool.Exec(ctx, `UPDATE presales_analyses SET boq_status = 'pending' WHERE project_id = $1`, pa.ProjectID)
	if err != nil {
		return err
	}
	pa.BOQStatus = "pending"
	return nil
}

// recomputeOverallStatus: dipanggil tiap kali salah satu dari 4 bagian di-submit.
// Kalau SEMUA 4 bagian sudah 'submitted' dan belum pernah diajukan approval,
// submit ke Approval Engine (entity_type='presales_price_approval'). Kalau belum
// lengkap, overall_status jadi 'in_progress'.
func recomputeOverallStatus(ctx context.Context, projectID int64, requestedBy int64) error {
	pa, err := scanPresalesAnalysis(ctx, projectID)
	if err != nil {
		return err
	}

	allSubmitted := pa.BOQStatus == "submitted" && pa.InstallationCostStatus == "submitted" &&
		pa.VendorCostStatus == "submitted" && pa.PnLStatus == "submitted"

	if !allSubmitted {
		if pa.OverallStatus == "draft" {
			_, err = database.Pool.Exec(ctx, `UPDATE presales_analyses SET overall_status = 'in_progress', updated_at = NOW() WHERE project_id = $1`, projectID)
		}
		return err
	}

	if pa.ApprovalRequestID != nil {
		return nil // sudah pernah diajukan approval, jangan submit dobel
	}

	var projectCode string
	_ = database.Pool.QueryRow(ctx, `SELECT project_code FROM projects WHERE id = $1`, projectID).Scan(&projectCode)
	label := fmt.Sprintf("Presales price approval - %s", projectCode)

	// Diatribusikan ke Finance (Finance yang finalisasi rekomendasi harga),
	// bukan universal -- supaya approval_matrices bisa spesifik per departemen.
	financeDeptID, _ := departmentIDByName(ctx, "Finance")
	ar, err := SubmitForApproval(ctx, "presales_price_approval", strconv.FormatInt(projectID, 10), &label, pa.RecommendedPrice, financeDeptID, requestedBy)
	if err != nil {
		return err
	}

	// approval_requests pakai 'pending', presales_analyses.overall_status pakai
	// 'pending_approval' -- vokabuler beda utk state yang sama, harus di-map.
	overallStatus := ar.Status
	if overallStatus == "pending" {
		overallStatus = "pending_approval"
	}

	_, err = database.Pool.Exec(ctx, `
		UPDATE presales_analyses SET approval_request_id = $1, overall_status = $2, updated_at = NOW() WHERE project_id = $3
	`, ar.ID, overallStatus, projectID)
	return err
}

// CheckPresalesGateForQuotation: dipanggil project_update.go sebelum mengizinkan
// sales_stage pindah dari <4 ke >=4 (Quotation). true = boleh lanjut.
func CheckPresalesGateForQuotation(ctx context.Context, projectID int64) (bool, string, error) {
	pa, err := scanPresalesAnalysis(ctx, projectID)
	if err != nil {
		return false, "presales analysis belum dibuat untuk project ini", nil
	}
	if err := syncOverallStatusFromApproval(ctx, pa); err != nil {
		return false, "", err
	}
	if pa.OverallStatus != "approved" {
		return false, "presales analysis belum disetujui (status saat ini: " + pa.OverallStatus + ")", nil
	}
	return true, "", nil
}

// ===== HTTP handlers =====

func GetPresalesAnalysis(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	pa, err := getOrInitPresalesAnalysis(c, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncBOQStatusFromApproval(c, pa); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// syncBOQStatusFromApproval bisa memicu recomputeOverallStatus, yang
	// menulis overall_status ke DB tapi TIDAK merefresh field itu di *pa
	// (cuma BOQStatus yang di-mutate langsung) -- scan ulang supaya respons
	// tidak balikin overall_status basi (mis. "draft" padahal DB sudah
	// "in_progress" begitu bagian ProDev baru saja disetujui manajer).
	pa, err = scanPresalesAnalysis(c, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncOverallStatusFromApproval(c, pa); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	pa.BOQItems, _ = queryBOQItems(c, projectID)

	c.JSON(http.StatusOK, pa)
}

// UpdateProdevSection: berbeda dari 3 bagian lain (Operations/Procurement/
// Finance) -- transisi pending->submitted TIDAK langsung final, tapi lewat
// approval manager staff (approver_type='requester_manager', entity_type=
// 'presales_prodev_submission', lihat migrasi 0033). Kalau requester tidak
// py manager_id (mis. GM ProDev sendiri yang requester), SubmitForApproval
// auto-skip -> langsung 'submitted' spt sebelumnya, tidak ada blokir baru
// utk kasus itu. Scope SENGAJA cuma bagian ini, lihat komentar migrasi.
func UpdateProdevSection(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	if !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development yang bisa mengisi bagian ini"})
		return
	}

	var body struct {
		SolutionSummary *string `json:"solution_summary"`
		Status          string  `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "pending" && body.Status != "submitted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus 'pending' atau 'submitted'"})
		return
	}

	pa, err := getOrInitPresalesAnalysis(c, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncBOQStatusFromApproval(c, pa); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pa.BOQStatus == "pending_approval" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sedang menunggu approval manajer, tidak bisa diubah dulu"})
		return
	}

	// Submission baru (pending -> submitted): ajukan approval manager dulu,
	// BUKAN langsung final -- beda dari transisi lain (submitted->pending,
	// atau resubmit saat sudah submitted) yang tetap langsung spt sebelumnya.
	if body.Status == "submitted" && pa.BOQStatus == "pending" {
		_, err = database.Pool.Exec(c, `
			UPDATE presales_analyses SET solution_summary = COALESCE($1, solution_summary), updated_at = NOW()
			WHERE project_id = $2
		`, body.SolutionSummary, projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var projectCode string
		_ = database.Pool.QueryRow(c, `SELECT project_code FROM projects WHERE id = $1`, projectID).Scan(&projectCode)
		label := fmt.Sprintf("Presales ProDev submission - %s", projectCode)
		prodevDeptID, _ := departmentIDByName(c, "Product & Development")

		ar, err := SubmitForApproval(c, "presales_prodev_submission", strconv.FormatInt(projectID, 10), &label, nil, prodevDeptID, c.GetInt64("user_id"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if ar.Status == "approved" {
			_, err = database.Pool.Exec(c, `
				UPDATE presales_analyses SET boq_status = 'submitted', boq_approval_request_id = $1,
				       boq_submitted_at = CASE WHEN boq_submitted_at IS NULL THEN NOW() ELSE boq_submitted_at END,
				       updated_at = NOW()
				WHERE project_id = $2
			`, ar.ID, projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			if err := recomputeOverallStatus(c, projectID, c.GetInt64("user_id")); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		} else {
			_, err = database.Pool.Exec(c, `
				UPDATE presales_analyses SET boq_status = 'pending_approval', boq_approval_request_id = $1, updated_at = NOW()
				WHERE project_id = $2
			`, ar.ID, projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	} else {
		_, err = database.Pool.Exec(c, `
			UPDATE presales_analyses SET solution_summary = COALESCE($1, solution_summary), boq_status = $2,
			       boq_submitted_at = CASE WHEN $2 = 'submitted' AND boq_submitted_at IS NULL THEN NOW() ELSE boq_submitted_at END,
			       updated_at = NOW()
			WHERE project_id = $3
		`, body.SolutionSummary, body.Status, projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := recomputeOverallStatus(c, projectID, c.GetInt64("user_id")); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "presales_analysis_boq", strconv.FormatInt(projectID, 10), "", body)

	pa, _ = scanPresalesAnalysis(c, projectID)
	c.JSON(http.StatusOK, pa)
}

func UpdateOperationsSection(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	if !requireDepartment(c, "Operations") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Operations yang bisa mengisi bagian ini"})
		return
	}

	var body struct {
		InstallationCostEstimate *float64 `json:"installation_cost_estimate"`
		Status                   string   `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "pending" && body.Status != "submitted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus 'pending' atau 'submitted'"})
		return
	}

	if _, err := getOrInitPresalesAnalysis(c, projectID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE presales_analyses SET installation_cost_estimate = COALESCE($1, installation_cost_estimate), installation_cost_status = $2,
		       installation_cost_submitted_at = CASE WHEN $2 = 'submitted' AND installation_cost_submitted_at IS NULL THEN NOW() ELSE installation_cost_submitted_at END,
		       updated_at = NOW()
		WHERE project_id = $3
	`, body.InstallationCostEstimate, body.Status, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := recomputeOverallStatus(c, projectID, c.GetInt64("user_id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "presales_analysis_operations", strconv.FormatInt(projectID, 10), "", body)

	pa, _ := scanPresalesAnalysis(c, projectID)
	c.JSON(http.StatusOK, pa)
}

func UpdateProcurementSection(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	if !requireDepartment(c, "Procurement") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Procurement yang bisa mengisi bagian ini"})
		return
	}

	var body struct {
		VendorCostEstimate *float64 `json:"vendor_cost_estimate"`
		Status             string   `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "pending" && body.Status != "submitted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus 'pending' atau 'submitted'"})
		return
	}

	if _, err := getOrInitPresalesAnalysis(c, projectID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE presales_analyses SET vendor_cost_estimate = COALESCE($1, vendor_cost_estimate), vendor_cost_status = $2,
		       vendor_cost_submitted_at = CASE WHEN $2 = 'submitted' AND vendor_cost_submitted_at IS NULL THEN NOW() ELSE vendor_cost_submitted_at END,
		       updated_at = NOW()
		WHERE project_id = $3
	`, body.VendorCostEstimate, body.Status, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := recomputeOverallStatus(c, projectID, c.GetInt64("user_id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "presales_analysis_procurement", strconv.FormatInt(projectID, 10), "", body)

	pa, _ := scanPresalesAnalysis(c, projectID)
	c.JSON(http.StatusOK, pa)
}

func UpdateFinanceSection(c *gin.Context) {
	projectID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa mengisi bagian ini"})
		return
	}

	var body struct {
		RecommendedPrice *float64 `json:"recommended_price"`
		Status           string   `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "pending" && body.Status != "submitted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus 'pending' atau 'submitted'"})
		return
	}

	if _, err := getOrInitPresalesAnalysis(c, projectID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE presales_analyses SET recommended_price = COALESCE($1, recommended_price), pnl_status = $2,
		       pnl_submitted_at = CASE WHEN $2 = 'submitted' AND pnl_submitted_at IS NULL THEN NOW() ELSE pnl_submitted_at END,
		       updated_at = NOW()
		WHERE project_id = $3
	`, body.RecommendedPrice, body.Status, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := recomputeOverallStatus(c, projectID, c.GetInt64("user_id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "presales_analysis_finance", strconv.FormatInt(projectID, 10), "", body)

	pa, _ := scanPresalesAnalysis(c, projectID)
	c.JSON(http.StatusOK, pa)
}
