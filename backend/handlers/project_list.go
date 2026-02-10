package handlers

import (
	"database/sql"
	"fmt"
	"sales-system-backend/database"
	"sales-system-backend/models"
	"strings"
	"time"
	"net/http"
	"strconv"
	"encoding/csv"

	"github.com/gin-gonic/gin"
)

type PostPOMonitoringResponse struct {
	Stage1Status string `json:"stage1_status"`
	Stage2Status string `json:"stage2_status"`
	Stage3Status string `json:"stage3_status"`
	Stage4Status string `json:"stage4_status"`
	Stage5Status string `json:"stage5_status"`
}

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

	-- ✅ SPH fields untuk list
	p.sph_status,
	p.sph_number,
	p.sph_release_date,

	-- ✅ reason fields
	p.sph_status_reason_category,
	p.sph_status_reason_note,

	COALESCE(SUM(rp.target_revenue), 0)::float8     AS total_revenue,
	COALESCE(SUM(rp.target_realization), 0)::float8 AS total_realization,

	MIN(rp.month)::text AS start_month,
	MAX(rp.month)::text AS end_month,

	-- ✅ postpo monitoring (nullable)
	m.stage1_status,
	m.stage2_status,
	m.stage3_status,
	m.stage4_status,
	m.stage5_status

	FROM projects p
	LEFT JOIN customers cu ON cu.id = p.customer_id
	LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
	LEFT JOIN project_postpo_monitoring m ON m.project_id = p.id
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
	p.sph_release_status,

	-- ✅ wajib masuk GROUP BY (non-aggregated fields)
	p.sph_status,
	p.sph_number,
	p.sph_release_date,
	p.sph_status_reason_category,
	p.sph_status_reason_note,

	-- monitoring fields (non-aggregated)
	m.stage1_status,
	m.stage2_status,
	m.stage3_status,
	m.stage4_status,
	m.stage5_status
	ORDER BY %s %s
	`, whereClause, col, sortDir)

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type ProjectResponse struct {
		ID                      int64                     `json:"id"`
		ProjectCode             string                    `json:"project_code"`
		Description             string                    `json:"description"`
		CustomerID              *int64                    `json:"customer_id"`
		CustomerName            string                    `json:"customer_name"`
		Division                string                    `json:"division"`
		Status                  string                    `json:"status"`
		ProjectType             string                    `json:"project_type"`
		SalesStage              int                       `json:"sales_stage"`
		SphReleaseStatus        string                    `json:"sph_release_status"`
		SPHStatus               *string                   `json:"sph_status,omitempty"`
		SPHNumber               *string                   `json:"sph_number,omitempty"`
		SPHRelease              *time.Time                `json:"sph_release_date,omitempty"`
		SPHStatusReasonCategory *string                   `json:"sph_status_reason_category,omitempty"`
		SPHStatusReasonNote     *string                   `json:"sph_status_reason_note,omitempty"`
		TotalRevenue            float64                   `json:"total_revenue"`
		TotalRealization        float64                   `json:"total_realization"`
		StartMonth              *string                   `json:"start_month"`
		EndMonth                *string                   `json:"end_month"`
		PostPOMonitoring        *PostPOMonitoringResponse `json:"postpo_monitoring,omitempty"`
	}

	var list []ProjectResponse
	for rows.Next() {
		var p ProjectResponse

		var s1, s2, s3, s4, s5 sql.NullString

		err := rows.Scan(
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
			&p.SPHStatus,
			&p.SPHNumber,
			&p.SPHRelease,
			&p.SPHStatusReasonCategory,
			&p.SPHStatusReasonNote,
			&p.TotalRevenue,
			&p.TotalRealization,
			&p.StartMonth,
			&p.EndMonth,
			&s1, &s2, &s3, &s4, &s5, // ✅ added
		)
		if err != nil {
			fmt.Println("SCAN ERROR:", err)
			continue
		}

		// ✅ set monitoring hanya kalau ada row monitoringnya
		if s1.Valid || s2.Valid || s3.Valid || s4.Valid || s5.Valid {
			p.PostPOMonitoring = &PostPOMonitoringResponse{
				Stage1Status: s1.String,
				Stage2Status: s2.String,
				Stage3Status: s3.String,
				Stage4Status: s4.String,
				Stage5Status: s5.String,
			}
		}

		list = append(list, p)
	}

	c.JSON(200, list)
}

func GetProjectsSummary(c *gin.Context) {
	ctx := c.Request.Context()

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	// ACL where (konsisten dengan dashboard & project list)
	where := "1=1"
	args := []any{}
	if role == "user" {
		where = "p.division = $1"
		args = append(args, userDiv)
	}

	var resp models.ProjectSummaryResponse

	// =============================
	// TOTAL PROJECTS
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COUNT(*)
			FROM projects p
			WHERE %s
		`, where),
		args...,
	).Scan(&resp.TotalProjects)

	// =============================
	// PIPELINE / PROSPECT
	// sales_stage < 6
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COUNT(*)
			FROM projects p
			WHERE %s
			  AND p.sales_stage < 6
		`, where),
		args...,
	).Scan(&resp.ProspectProjects)

	// =============================
	// CLOSING
	// sales_stage = 6
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COUNT(*)
			FROM projects p
			WHERE %s
			  AND p.sales_stage = 6
		`, where),
		args...,
	).Scan(&resp.ClosingProjects)

	// =============================
	// IN EXECUTION
	// - sales_stage = 6
	// - BELUM completed
	// - termasuk yang BELUM ada postPO monitoring
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COUNT(*)
			FROM projects p
			LEFT JOIN project_postpo_monitoring m
			       ON m.project_id = p.id
			WHERE %s
			  AND p.sales_stage = 6
			  AND (
			    m.project_id IS NULL
			    OR NOT (
			      m.stage1_status = 'Done' AND
			      m.stage2_status = 'Done' AND
			      m.stage3_status = 'Done' AND
			      m.stage4_status = 'Done' AND
			      m.stage5_status = 'Done'
			    )
			  )
		`, where),
		args...,
	).Scan(&resp.InExecutionProjects)

	// =============================
	// COMPLETED
	// - sales_stage = 6
	// - SEMUA postPO stage = Done
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COUNT(*)
			FROM projects p
			JOIN project_postpo_monitoring m
			      ON m.project_id = p.id
			WHERE %s
			  AND p.sales_stage = 6
			  AND m.stage1_status = 'Done'
			  AND m.stage2_status = 'Done'
			  AND m.stage3_status = 'Done'
			  AND m.stage4_status = 'Done'
			  AND m.stage5_status = 'Done'
		`, where),
		args...,
	).Scan(&resp.CompletedProjects)

	// =============================
	// TOTAL TARGET REVENUE
	// (harus join ke projects agar terfilter divisi)
	// =============================
	_ = database.Pool.QueryRow(ctx,
		fmt.Sprintf(`
			SELECT COALESCE(SUM(rp.target_revenue), 0)
			FROM project_revenue_plan rp
			JOIN projects p ON p.id = rp.project_id
			WHERE %s
		`, where),
		args...,
	).Scan(&resp.TotalTargetRevenue)

	c.JSON(200, resp)
}

func ExportProjectsCSV(c *gin.Context) {
	ctx := c.Request.Context()

	// ===== year (Jan-Dec spreading) =====
	year := time.Now().Year()
	if y := strings.TrimSpace(c.Query("year")); y != "" {
		if yy, err := strconv.Atoi(y); err == nil && yy > 2000 && yy < 2100 {
			year = yy
		}
	}
	startYear := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	// ===== ACL & filters =====
	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	args := []any{startYear} // $1 reserved for year
	i := 2
	whereParts := []string{"1=1"}

	// ACL: user locked to division
	if role == "user" {
		whereParts = append(whereParts, fmt.Sprintf("p.division = $%d", i))
		args = append(args, userDiv)
		i++
	} else {
		// admin/other can filter division
		divQ := NormalizeDivision(strings.TrimSpace(c.Query("division")))
		if divQ != "" && strings.ToUpper(divQ) != "ALL" {
			whereParts = append(whereParts, fmt.Sprintf("p.division = $%d", i))
			args = append(args, divQ)
			i++
		}
	}

	// Customer filter
	if v := strings.TrimSpace(c.Query("customer_id")); v != "" && strings.ToUpper(v) != "ALL" {
		if cid, err := strconv.ParseInt(v, 10, 64); err == nil {
			whereParts = append(whereParts, fmt.Sprintf("p.customer_id = $%d", i))
			args = append(args, cid)
			i++
		}
	}

	// Status filter
	if v := strings.TrimSpace(c.Query("status")); v != "" && strings.ToUpper(v) != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("p.status = $%d", i))
		args = append(args, v)
		i++
	}

	// SPH Released filter: Yes/No
	if v := strings.TrimSpace(c.Query("sph_released")); v != "" && strings.ToUpper(v) != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("COALESCE(p.sph_release_status,'No') = $%d", i))
		args = append(args, v)
		i++
	}

	// Project type filter
	if v := strings.TrimSpace(c.Query("project_type")); v != "" && strings.ToUpper(v) != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("p.project_type = $%d", i))
		args = append(args, v)
		i++
	}

	// Sales stage filter (numeric)
	if v := strings.TrimSpace(c.Query("sales_stage")); v != "" && strings.ToUpper(v) != "ALL" {
		if n, err := strconv.Atoi(v); err == nil {
			whereParts = append(whereParts, fmt.Sprintf("p.sales_stage = $%d", i))
			args = append(args, n)
			i++
		}
	}

	// Card mode pipeline
	if strings.TrimSpace(c.Query("card_mode")) == "pipeline" {
		whereParts = append(whereParts, "p.sales_stage > 0 AND p.sales_stage < 6")
	}

	// SPH Status filter (normalize to Open/Win/Hold/Loss/Drop)
	if v := strings.TrimSpace(c.Query("sph_status")); v != "" && strings.ToUpper(v) != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf(`
			(
				CASE
					WHEN lower(COALESCE(p.sph_status,'')) = 'win'  THEN 'Win'
					WHEN lower(COALESCE(p.sph_status,'')) = 'hold' THEN 'Hold'
					WHEN lower(COALESCE(p.sph_status,'')) = 'loss' THEN 'Loss'
					WHEN lower(COALESCE(p.sph_status,'')) = 'drop' THEN 'Drop'
					ELSE 'Open'
				END
			) = $%d`, i))
		args = append(args, v)
		i++
	}

	// execution filter (requires monitoring row)
	if ef := strings.TrimSpace(c.Query("execution")); ef != "" && ef != "all" {
		doneExpr := `(m.stage1_status='Done' AND m.stage2_status='Done' AND m.stage3_status='Done' AND m.stage4_status='Done' AND m.stage5_status='Done')`
		if ef == "completed" {
			whereParts = append(whereParts, "m.project_id IS NOT NULL AND "+doneExpr)
		} else if ef == "in_execution" {
			whereParts = append(whereParts, "m.project_id IS NOT NULL AND NOT "+doneExpr)
		}
	}

	// search q (code/desc)
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		whereParts = append(whereParts, fmt.Sprintf("(p.project_code ILIKE $%d OR p.description ILIKE $%d)", i, i))
		args = append(args, "%"+q+"%")
		i++
	}

	// month range filter using rp_rng min/max
	startMonth := strings.TrimSpace(c.Query("start_month")) // "YYYY-MM"
	endMonth := strings.TrimSpace(c.Query("end_month"))     // "YYYY-MM"

	if startMonth != "" {
		whereParts = append(whereParts, fmt.Sprintf("(rp_rng.max_month IS NOT NULL AND rp_rng.max_month >= $%d)", i))
		args = append(args, startMonth+"-01")
		i++
	}
	if endMonth != "" {
		whereParts = append(whereParts, fmt.Sprintf("(rp_rng.min_month IS NOT NULL AND rp_rng.min_month <= $%d)", i))
		args = append(args, endMonth+"-01")
		i++
	}

	whereClause := "WHERE " + strings.Join(whereParts, " AND ")

	// ===== SQL (no double join; numeric to text) =====
	sql := fmt.Sprintf(`
WITH rp_rng AS (
  SELECT project_id, MIN(month) AS min_month, MAX(month) AS max_month
  FROM project_revenue_plan
  GROUP BY project_id
),
rp_year AS (
  SELECT
    project_id,
    COALESCE(SUM(target_revenue),0)::text AS total_revenue,
    COALESCE(SUM(target_realization),0)::text AS total_realization,

    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=1  THEN target_revenue ELSE 0 END),0)::text AS target_jan,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=2  THEN target_revenue ELSE 0 END),0)::text AS target_feb,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=3  THEN target_revenue ELSE 0 END),0)::text AS target_mar,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=4  THEN target_revenue ELSE 0 END),0)::text AS target_apr,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=5  THEN target_revenue ELSE 0 END),0)::text AS target_may,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=6  THEN target_revenue ELSE 0 END),0)::text AS target_jun,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=7  THEN target_revenue ELSE 0 END),0)::text AS target_jul,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=8  THEN target_revenue ELSE 0 END),0)::text AS target_aug,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=9  THEN target_revenue ELSE 0 END),0)::text AS target_sep,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=10 THEN target_revenue ELSE 0 END),0)::text AS target_oct,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=11 THEN target_revenue ELSE 0 END),0)::text AS target_nov,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=12 THEN target_revenue ELSE 0 END),0)::text AS target_dec,

    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=1  THEN target_realization ELSE 0 END),0)::text AS real_jan,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=2  THEN target_realization ELSE 0 END),0)::text AS real_feb,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=3  THEN target_realization ELSE 0 END),0)::text AS real_mar,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=4  THEN target_realization ELSE 0 END),0)::text AS real_apr,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=5  THEN target_realization ELSE 0 END),0)::text AS real_may,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=6  THEN target_realization ELSE 0 END),0)::text AS real_jun,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=7  THEN target_realization ELSE 0 END),0)::text AS real_jul,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=8  THEN target_realization ELSE 0 END),0)::text AS real_aug,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=9  THEN target_realization ELSE 0 END),0)::text AS real_sep,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=10 THEN target_realization ELSE 0 END),0)::text AS real_oct,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=11 THEN target_realization ELSE 0 END),0)::text AS real_nov,
    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM month)=12 THEN target_realization ELSE 0 END),0)::text AS real_dec

  FROM project_revenue_plan
  WHERE month >= $1::date AND month < ($1::date + INTERVAL '1 year')
  GROUP BY project_id
)

SELECT
  p.project_code,
  COALESCE(p.description,'') AS description,
  p.division,
  COALESCE(cu.name,'') AS customer_name,
  p.project_type,
  p.status,

  CASE p.sales_stage
    WHEN 1 THEN '1 - Prospecting'
    WHEN 2 THEN '2 - Qualification'
    WHEN 3 THEN '3 - Presales Analysis'
    WHEN 4 THEN '4 - Quotation'
    WHEN 5 THEN '5 - Negotiation'
    WHEN 6 THEN '6 - Closing'
    ELSE 'Unknown'
  END AS sales_stage_text,

  CASE
    WHEN COALESCE(m.stage5_status,'Not Started') <> 'Not Started' THEN 'Stage 5 - ' || m.stage5_status
    WHEN COALESCE(m.stage4_status,'Not Started') <> 'Not Started' THEN 'Stage 4 - ' || m.stage4_status
    WHEN COALESCE(m.stage3_status,'Not Started') <> 'Not Started' THEN 'Stage 3 - ' || m.stage3_status
    WHEN COALESCE(m.stage2_status,'Not Started') <> 'Not Started' THEN 'Stage 2 - ' || m.stage2_status
    WHEN COALESCE(m.stage1_status,'Not Started') <> 'Not Started' THEN 'Stage 1 - ' || m.stage1_status
    ELSE 'Stage 1 - Not Started'
  END AS post_po_last_status,

  COALESCE(p.sph_release_status,'No') AS sph_release_status,
  COALESCE(p.sph_status,'') AS sph_status,
  COALESCE(p.sph_status_reason_category,'') AS reason_category,
  COALESCE(p.sph_status_reason_note,'') AS reason_note,

  COALESCE(rp_year.total_revenue,'0') AS total_revenue,
  COALESCE(rp_year.total_realization,'0') AS total_realization,

  COALESCE(rp_year.target_jan,'0') AS target_jan,
  COALESCE(rp_year.target_feb,'0') AS target_feb,
  COALESCE(rp_year.target_mar,'0') AS target_mar,
  COALESCE(rp_year.target_apr,'0') AS target_apr,
  COALESCE(rp_year.target_may,'0') AS target_may,
  COALESCE(rp_year.target_jun,'0') AS target_jun,
  COALESCE(rp_year.target_jul,'0') AS target_jul,
  COALESCE(rp_year.target_aug,'0') AS target_aug,
  COALESCE(rp_year.target_sep,'0') AS target_sep,
  COALESCE(rp_year.target_oct,'0') AS target_oct,
  COALESCE(rp_year.target_nov,'0') AS target_nov,
  COALESCE(rp_year.target_dec,'0') AS target_dec,

  COALESCE(rp_year.real_jan,'0') AS real_jan,
  COALESCE(rp_year.real_feb,'0') AS real_feb,
  COALESCE(rp_year.real_mar,'0') AS real_mar,
  COALESCE(rp_year.real_apr,'0') AS real_apr,
  COALESCE(rp_year.real_may,'0') AS real_may,
  COALESCE(rp_year.real_jun,'0') AS real_jun,
  COALESCE(rp_year.real_jul,'0') AS real_jul,
  COALESCE(rp_year.real_aug,'0') AS real_aug,
  COALESCE(rp_year.real_sep,'0') AS real_sep,
  COALESCE(rp_year.real_oct,'0') AS real_oct,
  COALESCE(rp_year.real_nov,'0') AS real_nov,
  COALESCE(rp_year.real_dec,'0') AS real_dec

FROM projects p
LEFT JOIN customers cu ON cu.id = p.customer_id
LEFT JOIN project_postpo_monitoring m ON m.project_id = p.id
LEFT JOIN rp_rng ON rp_rng.project_id = p.id
LEFT JOIN rp_year ON rp_year.project_id = p.id

%s
ORDER BY p.project_code ASC
`, whereClause)

	rows, err := database.Pool.Query(ctx, sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	filename := fmt.Sprintf("projects_export_%d.csv", year)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	headers := []string{
		"Code", "Descriptions", "Divisi", "Customer", "Type", "Status",
		"Stage", "Post PO Last Status",
		"SPH Release?", "SPH Status", "Reason",
		"Total Revenue", "Total Realization",
		"(Target) January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
		"(Realization) January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
	}
	_ = w.Write(headers)

	for rows.Next() {
		var (
			code, desc, div, cust, typ, status                   string
			stageText, postPoLast                                string
			sphRel, sphStatus, reasonCat, reasonNote             string
			totalRev, totalReal                                  string
			tJan, tFeb, tMar, tApr, tMay, tJun, tJul, tAug, tSep, tOct, tNov, tDec string
			rJan, rFeb, rMar, rApr, rMay, rJun, rJul, rAug, rSep, rOct, rNov, rDec string
		)

		if err := rows.Scan(
			&code, &desc, &div, &cust, &typ, &status,
			&stageText, &postPoLast,
			&sphRel, &sphStatus, &reasonCat, &reasonNote,
			&totalRev, &totalReal,
			&tJan, &tFeb, &tMar, &tApr, &tMay, &tJun, &tJul, &tAug, &tSep, &tOct, &tNov, &tDec,
			&rJan, &rFeb, &rMar, &rApr, &rMay, &rJun, &rJul, &rAug, &rSep, &rOct, &rNov, &rDec,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		reason := ""
		if reasonCat != "" && reasonNote != "" {
			reason = reasonCat + ": " + reasonNote
		} else if reasonCat != "" {
			reason = reasonCat
		} else {
			reason = reasonNote
		}

		record := []string{
			code,
			strings.ReplaceAll(desc, ",", " "),
			div,
			cust,
			typ,
			status,

			stageText,
			postPoLast,

			sphRel,
			sphStatus,
			strings.ReplaceAll(reason, ",", " "),

			totalRev,
			totalReal,

			tJan, tFeb, tMar, tApr, tMay, tJun,
			tJul, tAug, tSep, tOct, tNov, tDec,

			rJan, rFeb, rMar, rApr, rMay, rJun,
			rJul, rAug, rSep, rOct, rNov, rDec,
		}
		_ = w.Write(record)
	}

	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
}


