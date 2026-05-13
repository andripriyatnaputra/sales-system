package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func CreateProject(c *gin.Context) {
	var body models.CreateProjectRequest

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// --- ACL DATA FROM JWT ---
	role := c.GetString("role")
	userDivision := NormalizeDivision(c.GetString("division"))

	// --- Normalize incoming division ---
	body.Division = NormalizeDivision(body.Division)

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

	// =============================
	//  ACL Enforcement
	// =============================
	if role == "user" {
		// FORCE project division to user’s division
		if userDivision == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "missing division in token"})
			return
		}

		body.Division = userDivision
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

	//
	// SPH STatus
	//
	// --- SPH Status validation + reason rules ---
	if body.SPHStatus != nil && *body.SPHStatus != "" {
		st := *body.SPHStatus
		if st != "Open" && st != "Win" && st != "Hold" && st != "Loss" && st != "Drop" {
			c.JSON(400, gin.H{"error": "invalid sph_status"})
			return
		}

		if st == "Loss" || st == "Drop" {
			if body.SPHStatusReasonCategory == nil || *body.SPHStatusReasonCategory == "" {
				c.JSON(400, gin.H{"error": "sph_status_reason_category required for Loss/Drop"})
				return
			}
			cat := *body.SPHStatusReasonCategory
			if cat != "Administrasi" && cat != "Teknis" && cat != "Pricing" && cat != "Other" {
				c.JSON(400, gin.H{"error": "invalid sph_status_reason_category"})
				return
			}
			if cat == "Other" {
				if body.SPHStatusReasonNote == nil || *body.SPHStatusReasonNote == "" {
					c.JSON(400, gin.H{"error": "sph_status_reason_note required when category=Other"})
					return
				}
			}
		} else {
			// Open/Win/Hold -> clear reason
			body.SPHStatusReasonCategory = nil
			body.SPHStatusReasonNote = nil
		}
	}

	// --- Final division validation ---
	if !isValidDivision(body.Division) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid division"})
		return
	}

	if body.SphReleaseStatus == "Yes" {
		for _, rp := range body.RevenuePlans {
			if rp.SPHRevenue == nil || *rp.SPHRevenue < 0 {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "sph_revenue is required and must be zero or greater when SPH Released = Yes",
				})
				return
			}
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

	// --- Begin transaction ---
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(500, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	// --- Generate project code AFTER division finalized ---
	//projectCode := generateProjectCode(body.Division)
	projectCode, err := generateProjectCodeTx(ctx, tx, body.Division)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed generate project code: %v", err)})
		return
	}

	fmt.Println("GENERATED projectCode:", projectCode)

	var id int64
	err = tx.QueryRow(ctx, `
        INSERT INTO projects (
			project_code, description, customer_id, division, status,
			project_type, pipeline_status,
			sph_status, sph_release_date, sales_stage,
			sph_release_status, sph_number,
			sph_status_reason_category, sph_status_reason_note
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
    `,
		projectCode,
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
	).Scan(&id)

	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("failed insert project: %v", err),
		})
		return
	}

	// ----------------------------------------------------
	// INSERT REVENUE PLANS
	// ----------------------------------------------------
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
		VALUES ($1,$2,$3,$4)
	`, id, month, rp.TargetRevenue, rp.SPHRevenue)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("failed insert revenue plan: %v", err),
			})
			return
		}
	}

	// --- Commit TX ---
	if err := tx.Commit(ctx); err != nil {
		c.JSON(500, gin.H{"error": "transaction commit error"})
		return
	}

	// --- SUCCESS RESPONSE ---
	c.JSON(201, gin.H{
		"id":           id,
		"project_code": projectCode,
		"division":     body.Division,
	})
}

func parseDatePtr(s *string) *time.Time {
	if s == nil {
		return nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil
	}
	return &t
}
