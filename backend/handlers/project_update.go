package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func UpdateProject(c *gin.Context) {
	// --- Parse ID ---
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	var body models.CreateProjectRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// --- ACL From token ---
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))

	// --- Fetch existing project division ---
	var existingDivision string
	err = database.Pool.QueryRow(ctx,
		`SELECT division FROM projects WHERE id = $1`,
		id,
	).Scan(&existingDivision)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	existingDivision = NormalizeDivision(existingDivision)

	// --- ACL Enforcement ---
	if role == "user" {
		// user hanya boleh update project divisi sendiri
		if existingDivision != userDivision {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: different division"})
			return
		}

		// user tidak boleh mengganti division, meskipun mengirim body.Division berbeda
		body.Division = existingDivision
	} else {
		// admin boleh ubah namun tetap normalisasi
		body.Division = NormalizeDivision(body.Division)
	}

	body.PipelineStatus = strings.TrimSpace(body.PipelineStatus)
	if body.PipelineStatus == "" {
		body.PipelineStatus = "Active"
	}

	if body.PipelineStatus != "Active" &&
		body.PipelineStatus != "Hold" &&
		body.PipelineStatus != "Drop" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pipeline_status"})
		return
	}

	if body.Status == "Carry Over" {
		body.SalesStage = 6
	}

	// =============================
	// BUSINESS RULE VALIDATION
	// =============================
	if body.ProjectType == "New Recurring" && body.Status != "New Prospect" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "New Recurring project type only allowed when status is New Prospect",
		})
		return
	}

	if err := validateAndNormalizeProjectFlow(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.SPHStatus != nil {
		st := *body.SPHStatus
		if st == "Loss" || st == "Drop" {
			// wajib reason category
			if body.SPHStatusReasonCategory == nil || *body.SPHStatusReasonCategory == "" {
				c.JSON(400, gin.H{"error": "sph_status_reason_category required for Loss/Drop"})
				return
			}
			cat := *body.SPHStatusReasonCategory
			if cat != "Administrasi" && cat != "Teknis" && cat != "Pricing" && cat != "Other" {
				c.JSON(400, gin.H{"error": "invalid sph_status_reason_category"})
				return
			}
			if cat == "Other" && (body.SPHStatusReasonNote == nil || *body.SPHStatusReasonNote == "") {
				c.JSON(400, gin.H{"error": "sph_status_reason_note required when category=Other"})
				return
			}
		} else {
			// Open/Win/Hold -> clear
			body.SPHStatusReasonCategory = nil
			body.SPHStatusReasonNote = nil
		}
	}

	if body.SphReleaseStatus != "Yes" {
		body.SphReleaseStatus = "No"
		body.SPHStatus = nil
		body.SPHRelease = nil
		body.SphNumber = nil
		body.SPHStatusReasonCategory = nil
		body.SPHStatusReasonNote = nil
	} else {
		if body.SalesStage < 4 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "SPH released project must be at least Quotation stage",
			})
			return
		}

		if body.SPHStatus == nil || strings.TrimSpace(*body.SPHStatus) == "" {
			open := "Open"
			body.SPHStatus = &open
		}

		st := strings.TrimSpace(*body.SPHStatus)
		body.SPHStatus = &st

		if st == "Win" || st == "Loss" || st == "Drop" {
			body.SalesStage = 6
		}
	}

	// --- Validate division ---
	if !isValidDivision(body.Division) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid division"})
		return
	}

	// --- Begin TX ---
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(500, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	// --- Update Project ---
	_, err = tx.Exec(ctx, `
	UPDATE projects
		SET description              = $1,
			customer_id              = $2,
			division                 = $3,
			status                   = $4,
			project_type               = $5,
			pipeline_status            = $6,
			sph_status                 = $7,
			sph_release_date           = $8,
			sales_stage                = $9,
			sph_release_status         = $10,
			sph_number                 = $11,
			sph_status_reason_category = $12,
			sph_status_reason_note     = $13,
			updated_at                 = NOW()
			WHERE id = $14
	`,
		body.Description,
		body.CustomerID,
		body.Division,
		body.Status,
		body.ProjectType,
		body.PipelineStatus,
		body.SPHStatus,
		parseDatePtr(body.SPHRelease),
		body.SalesStage,
		body.SphReleaseStatus,
		body.SphNumber,
		body.SPHStatusReasonCategory,
		body.SPHStatusReasonNote,
		id,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	// --- Replace revenue plans ---
	// target_revenue  = target awal / prospect value
	// sph_revenue     = nilai sesuai SPH, hanya update jika dikirim dari FE
	// target_realization tetap dipreserve, tidak disentuh di update project
	//
	// FE selalu mengirim daftar lengkap revenue plan project ini (bukan diff),
	// jadi bulan lama yang sudah tidak ada di payload (mis. dipindah dari
	// Januari ke Maret) harus dihapus di sini juga - kalau tidak, baris lama
	// tetap nyangkut dan revenue project jadi dobel (lama + baru).
	if len(body.RevenuePlans) > 0 {
		keepMonths := make([]string, 0, len(body.RevenuePlans))
		for _, rp := range body.RevenuePlans {
			keepMonths = append(keepMonths, rp.Month)
		}

		_, err = tx.Exec(ctx, `
		DELETE FROM project_revenue_plan
		WHERE project_id = $1
		  AND to_char(month, 'YYYY-MM') <> ALL($2::text[])
	`, id, keepMonths)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed to remove stale revenue plan months",
			})
			return
		}
	}

	for _, rp := range body.RevenuePlans {
		month, err := time.Parse("2006-01", rp.Month)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month format (YYYY-MM)"})
			return
		}

		_, err = tx.Exec(ctx, `
		INSERT INTO project_revenue_plan (
			project_id,
			month,
			target_revenue,
			sph_revenue
		)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (project_id, month)
		DO UPDATE SET
			target_revenue = EXCLUDED.target_revenue,
			sph_revenue = COALESCE(
				EXCLUDED.sph_revenue,
				project_revenue_plan.sph_revenue
			)
	`, id, month, rp.TargetRevenue, rp.SPHRevenue)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed upsert revenue plan",
			})
			return
		}
	}

	// --- Commit ---
	if err := tx.Commit(ctx); err != nil {
		c.JSON(500, gin.H{"error": "transaction commit error"})
		return
	}

	c.JSON(200, gin.H{"status": "ok"})
}
