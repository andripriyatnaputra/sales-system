package handlers

import (
	"fmt"
	"sales-system-backend/database"
	"sales-system-backend/models"
	"strings"

	"github.com/gin-gonic/gin"
)

func ListProjects(c *gin.Context) {
	ctx := c.Request.Context()

	// --- Sorting Support ---
	sortBy := c.DefaultQuery("sort_by", "id")
	sortDir := strings.ToLower(c.DefaultQuery("sort_dir", "desc"))

	allowed := map[string]string{
		"id":          "p.id",
		"code":        "p.project_code",
		"division":    "p.division",
		"status":      "p.status",
		"type":        "p.project_type",
		"revenue":     "total_revenue",
		"realization": "total_realization",
	}

	col, ok := allowed[sortBy]
	if !ok {
		col = "p.id"
	}
	if sortDir != "asc" && sortDir != "desc" {
		sortDir = "desc"
	}

	// --- ACL + FILTERS ---
	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	whereParts := []string{}
	args := []any{}
	i := 1

	// Sama dengan dashboard: user selalu dibatasi divisinya
	if role == "user" {
		whereParts = append(whereParts, fmt.Sprintf("p.division = $%d", i))
		args = append(args, userDiv)
		i++
	} else {
		// (Opsional) admin/manager boleh filter division via query
		divQ := NormalizeDivision(strings.TrimSpace(c.Query("division")))
		if divQ != "" && strings.ToUpper(divQ) != "ALL" {
			whereParts = append(whereParts, fmt.Sprintf("p.division = $%d", i))
			args = append(args, divQ)
			i++
		}
	}

	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = "WHERE " + strings.Join(whereParts, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT 
			p.id,
			p.project_code,
			p.description,
			p.customer_id,
			COALESCE(cu.name, '') AS customer_name,
			p.division,
			p.status,
			p.project_type,
			p.sales_stage,
			p.sph_release_status,

			COALESCE(SUM(rp.target_revenue), 0)::float8     AS total_revenue,
			COALESCE(SUM(rp.target_realization), 0)::float8 AS total_realization,

			MIN(rp.month)::text AS start_month,
			MAX(rp.month)::text AS end_month

		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		%s
		GROUP BY 
			p.id,
			p.project_code,
			p.description,
			p.customer_id,
			cu.name,
			p.division,
			p.status,
			p.project_type,
			p.sales_stage,
			p.sph_release_status
		ORDER BY %s %s
	`, whereClause, col, sortDir)

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type ProjectResponse struct {
		ID               int64   `json:"id"`
		ProjectCode      string  `json:"project_code"`
		Description      string  `json:"description"`
		CustomerID       *int64  `json:"customer_id"`
		CustomerName     string  `json:"customer_name"`
		Division         string  `json:"division"`
		Status           string  `json:"status"`
		ProjectType      string  `json:"project_type"`
		SalesStage       int     `json:"sales_stage"`
		SphReleaseStatus string  `json:"sph_release_status"`
		TotalRevenue     float64 `json:"total_revenue"`
		TotalRealization float64 `json:"total_realization"`
		StartMonth       *string `json:"start_month"`
		EndMonth         *string `json:"end_month"`
	}

	var list []ProjectResponse
	for rows.Next() {
		var p ProjectResponse
		if err := rows.Scan(
			&p.ID,
			&p.ProjectCode,
			&p.Description,
			&p.CustomerID,
			&p.CustomerName,
			&p.Division,
			&p.Status,
			&p.ProjectType,
			&p.SalesStage,
			&p.SphReleaseStatus,
			&p.TotalRevenue,
			&p.TotalRealization,
			&p.StartMonth,
			&p.EndMonth,
		); err != nil {
			fmt.Println("SCAN ERROR:", err)
			continue
		}
		list = append(list, p)
	}

	c.JSON(200, list)
}

func GetProjectsSummary(c *gin.Context) {
	ctx := c.Request.Context()

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	// ACL where (konsisten dengan dashboard)
	where := "1=1"
	args := []any{}
	if role == "user" {
		where = "p.division = $1"
		args = append(args, userDiv)
	}

	var resp models.ProjectSummaryResponse

	// Total Projects
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM projects p WHERE %s`, where),
		args...,
	).Scan(&resp.TotalProjects)

	// Prospect / Pipeline
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM projects p WHERE %s AND p.sales_stage < 6`, where),
		args...,
	).Scan(&resp.ProspectProjects)

	// Closing
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM projects p WHERE %s AND p.sales_stage = 6`, where),
		args...,
	).Scan(&resp.ClosingProjects)

	// In Execution (Post-PO started but not completed)
	_ = database.Pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COUNT(*)
		FROM project_postpo_monitoring m
		JOIN projects p ON p.id = m.project_id
		WHERE %s
		  AND p.sales_stage = 6
		  AND NOT (
		    m.stage1_status='Done' AND
		    m.stage2_status='Done' AND
		    m.stage3_status='Done' AND
		    m.stage4_status='Done' AND
		    m.stage5_status='Done'
		  )
	`, where), args...).Scan(&resp.InExecutionProjects)

	// Completed Projects (harus join ke projects supaya bisa filter division)
	_ = database.Pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COUNT(*)
		FROM project_postpo_monitoring m
		JOIN projects p ON p.id = m.project_id
		WHERE %s
		  AND m.stage1_status='Done'
		  AND m.stage2_status='Done'
		  AND m.stage3_status='Done'
		  AND m.stage4_status='Done'
		  AND m.stage5_status='Done'
	`, where), args...).Scan(&resp.CompletedProjects)

	// Total Target Revenue (filter divisi harus lewat join ke projects)
	_ = database.Pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COALESCE(SUM(rp.target_revenue),0)
		FROM project_revenue_plan rp
		JOIN projects p ON p.id = rp.project_id
		WHERE %s
	`, where), args...).Scan(&resp.TotalTargetRevenue)

	c.JSON(200, resp)
}
