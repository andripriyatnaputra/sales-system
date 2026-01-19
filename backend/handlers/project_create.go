package handlers

import (
	"fmt"
	"net/http"
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

	// --- Final division validation ---
	if !isValidDivision(body.Division) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid division"})
		return
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
	fmt.Sprintf("GENERATED projectCode:", projectCode)

	var id int64
	err = tx.QueryRow(ctx, `
        INSERT INTO projects (
            project_code, description, customer_id, division, status,
            project_type, sph_status, sph_release_date, sales_stage,
            sph_release_status, sph_number
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
    `,
		projectCode,
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
			c.JSON(400, gin.H{"error": "invalid month format (YYYY-MM)"})
			return
		}

		_, err = tx.Exec(ctx, `
            INSERT INTO project_revenue_plan (project_id, month, target_revenue)
            VALUES ($1,$2,$3)
        `, id, month, rp.TargetRevenue)

		if err != nil {
			c.JSON(500, gin.H{"error": "failed insert revenue plan"})
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
