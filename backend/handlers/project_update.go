package handlers

import (
	"net/http"
	"strconv"
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

	if body.SPHStatus != nil {
		st := *body.SPHStatus
		if st == "Loss" || st == "Drop" {
			// wajib reason category
			if body.SPHStatusReasonCategory == nil || *body.SPHStatusReasonCategory == "" {
				c.JSON(400, gin.H{"error": "sph_status_reason_category required for Loss/Drop"})
				return
			}
			cat := *body.SPHStatusReasonCategory
			if cat != "Administrasi" && cat != "Teknis" && cat != "Other" {
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
			project_type             = $5,
			sph_status               = $6,
			sph_release_date         = $7,
			sales_stage              = $8,
			sph_release_status       = $9,
			sph_number               = $10,
			sph_status_reason_category = $11,
			sph_status_reason_note     = $12,
			updated_at               = NOW()
	WHERE id = $13
	`,
		body.Description,
		body.CustomerID,
		body.Division,
		body.Status,
		body.ProjectType,
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
	_, err = tx.Exec(ctx,
		`DELETE FROM project_revenue_plan WHERE project_id = $1`, id,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed clear old revenue plans"})
		return
	}

	for _, rp := range body.RevenuePlans {
		month, err := time.Parse("2006-01", rp.Month)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid month format (YYYY-MM)"})
			return
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO project_revenue_plan (project_id, month, target_revenue)
			VALUES ($1, $2, $3)
		`, id, month, rp.TargetRevenue)

		if err != nil {
			c.JSON(500, gin.H{"error": "failed insert revenue plan"})
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
