package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func pipelineStageLabel(stage int) string {
	switch stage {
	case 1:
		return "Prospecting"
	case 2:
		return "Qualification"
	case 3:
		return "Presales Analysis"
	case 4:
		return "Quotation"
	case 5:
		return "Negotiation"
	case 6:
		return "Closing"
	default:
		return "Unknown"
	}
}

func normalizedSPHStatusExpr() string {
	return `
		CASE
			WHEN lower(COALESCE(p.sph_status,'')) = 'win'  THEN 'Win'
			WHEN lower(COALESCE(p.sph_status,'')) = 'hold' THEN 'Hold'
			WHEN lower(COALESCE(p.sph_status,'')) = 'loss' THEN 'Loss'
			WHEN lower(COALESCE(p.sph_status,'')) = 'drop' THEN 'Drop'
			ELSE 'Open'
		END
	`
}

// buildProjectAnalyticsFilter
// Catatan:
// - filter waktu diaplikasikan ke rp.month
// - karena itu helper ini dipakai hanya pada query yang JOIN project_revenue_plan rp
func buildProjectAnalyticsFilter(c *gin.Context) (string, []any) {
	role := strings.TrimSpace(c.GetString("role"))
	userDiv := NormalizeDivision(strings.TrimSpace(c.GetString("division")))

	conds := []string{"1=1"}
	args := []any{}
	i := 1

	division := NormalizeDivision(strings.TrimSpace(c.Query("division")))
	customerIDStr := strings.TrimSpace(c.Query("customer_id"))
	status := strings.TrimSpace(c.Query("status"))
	projectType := strings.TrimSpace(c.Query("project_type"))
	salesStageStr := strings.TrimSpace(c.Query("sales_stage"))
	sphReleased := strings.TrimSpace(c.Query("sph_released"))
	sphStatus := strings.TrimSpace(c.Query("sph_status"))

	fromStr := strings.TrimSpace(c.Query("from"))
	toStr := strings.TrimSpace(c.Query("to"))

	if role == "user" {
		division = userDiv
	}

	if division != "" && strings.ToUpper(division) != "ALL" {
		conds = append(conds, fmt.Sprintf("p.division = $%d", i))
		args = append(args, division)
		i++
	}

	if customerIDStr != "" && strings.ToUpper(customerIDStr) != "ALL" {
		if customerID, err := strconv.ParseInt(customerIDStr, 10, 64); err == nil {
			conds = append(conds, fmt.Sprintf("p.customer_id = $%d", i))
			args = append(args, customerID)
			i++
		}
	}

	if status != "" && strings.ToUpper(status) != "ALL" {
		conds = append(conds, fmt.Sprintf("p.status = $%d", i))
		args = append(args, status)
		i++
	}

	if projectType != "" && strings.ToUpper(projectType) != "ALL" {
		conds = append(conds, fmt.Sprintf("p.project_type = $%d", i))
		args = append(args, projectType)
		i++
	}

	if salesStageStr != "" && strings.ToUpper(salesStageStr) != "ALL" {
		if salesStage, err := strconv.Atoi(salesStageStr); err == nil {
			conds = append(conds, fmt.Sprintf("p.sales_stage = $%d", i))
			args = append(args, salesStage)
			i++
		}
	}

	if sphReleased != "" && strings.ToUpper(sphReleased) != "ALL" {
		conds = append(conds, fmt.Sprintf("COALESCE(p.sph_release_status,'No') = $%d", i))
		args = append(args, sphReleased)
		i++
	}

	if sphStatus != "" && strings.ToUpper(sphStatus) != "ALL" {
		conds = append(conds, fmt.Sprintf("(%s) = $%d", normalizedSPHStatusExpr(), i))
		args = append(args, sphStatus)
		i++
	}

	loc := mustLoadLocation("Asia/Jakarta")

	var fromDate, toDate time.Time
	if fromStr == "" && toStr == "" {
		fromDate, toDate = defaultFiscalYearRange(loc)
	} else {
		if fromStr != "" {
			if t, err := parseYearMonthOrDate(fromStr); err == nil {
				fromDate = startOfMonth(t, loc)
			}
		}
		if toStr != "" {
			if t, err := parseYearMonthOrDate(toStr); err == nil {
				toDate = endOfMonth(t, loc)
			}
		}

		if !fromDate.IsZero() && toDate.IsZero() {
			y := fromDate.In(loc).Year()
			toDate = time.Date(y, time.December, 31, 23, 59, 59, 999999999, loc)
		}
		if fromDate.IsZero() && !toDate.IsZero() {
			y := toDate.In(loc).Year()
			fromDate = time.Date(y, time.January, 1, 0, 0, 0, 0, loc)
		}
	}

	if !fromDate.IsZero() && !toDate.IsZero() {
		conds = append(conds, fmt.Sprintf("rp.month >= $%d AND rp.month <= $%d", i, i+1))
		args = append(args, fromDate.UTC(), toDate.UTC())
		i += 2
	}

	return strings.Join(conds, " AND "), args
}

func GetProjectPipelineSummary(c *gin.Context) {
	ctx := c.Request.Context()

	where, args := buildProjectAnalyticsFilter(c)

	query := fmt.Sprintf(`
		WITH revenue_by_project AS (
			SELECT
				p.id AS project_id,
				p.sales_stage,
				COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value,
				COALESCE(SUM(rp.target_realization), 0)::float8 AS realization_value
			FROM projects p
			LEFT JOIN customers cu ON cu.id = p.customer_id
			LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
			WHERE %s
			GROUP BY p.id, p.sales_stage
		)
		SELECT
			sales_stage,
			COUNT(*)::bigint AS count,
			COALESCE(SUM(target_value), 0)::float8 AS target_value,
			COALESCE(SUM(realization_value), 0)::float8 AS realization_value,
			COALESCE(AVG(target_value), 0)::float8 AS avg_target_value
		FROM revenue_by_project
		WHERE sales_stage BETWEEN 1 AND 6
		GROUP BY sales_stage
		ORDER BY sales_stage
	`, where)

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	resp := models.ProjectPipelineSummaryResponse{
		Stages: make([]models.ProjectPipelineStageSummary, 0, 6),
	}

	for rows.Next() {
		var item models.ProjectPipelineStageSummary
		if err := rows.Scan(
			&item.Stage,
			&item.Count,
			&item.TargetValue,
			&item.RealizationValue,
			&item.AvgTargetValue,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		item.Label = pipelineStageLabel(item.Stage)
		resp.TotalProjects += item.Count
		resp.TotalTargetValue += item.TargetValue
		resp.TotalRealization += item.RealizationValue
		resp.Stages = append(resp.Stages, item)
	}

	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rows.Err().Error()})
		return
	}

	if resp.TotalProjects > 0 {
		resp.AvgDealSize = resp.TotalTargetValue / float64(resp.TotalProjects)
	}

	c.JSON(http.StatusOK, resp)
}

func GetProjectPipelineDetails(c *gin.Context) {
	ctx := c.Request.Context()

	where, args := buildProjectAnalyticsFilter(c)

	query := fmt.Sprintf(`
		SELECT
			p.id,
			p.project_code,
			COALESCE(p.description, '') AS description,
			COALESCE(cu.name, '') AS customer_name,
			p.division,
			p.status,
			p.project_type,
			p.sales_stage,
			COALESCE(p.sph_release_status, 'No') AS sph_release_status,
			p.sph_status,
			p.sph_number,
			p.sph_release_date,
			p.sph_status_reason_category,
			p.sph_status_reason_note,
			COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value,
			COALESCE(SUM(rp.target_realization), 0)::float8 AS realization_value,
			TO_CHAR(MIN(rp.month), 'YYYY-MM') AS start_month,
			TO_CHAR(MAX(rp.month), 'YYYY-MM') AS end_month
		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
		  AND p.sales_stage BETWEEN 1 AND 6
		GROUP BY
			p.id, p.project_code, p.description, cu.name,
			p.division, p.status, p.project_type, p.sales_stage,
			p.sph_release_status, p.sph_status, p.sph_number, p.sph_release_date,
			p.sph_status_reason_category, p.sph_status_reason_note
		ORDER BY p.sales_stage ASC, target_value DESC, p.project_code ASC
	`, where)

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]models.ProjectPipelineDetailItem, 0)
	for rows.Next() {
		var item models.ProjectPipelineDetailItem
		if err := rows.Scan(
			&item.ID,
			&item.ProjectCode,
			&item.Description,
			&item.CustomerName,
			&item.Division,
			&item.Status,
			&item.ProjectType,
			&item.SalesStage,
			&item.SPHReleaseStatus,
			&item.SPHStatus,
			&item.SPHNumber,
			&item.SPHReleaseDate,
			&item.SPHStatusReasonCategory,
			&item.SPHStatusReasonNote,
			&item.TargetValue,
			&item.RealizationValue,
			&item.StartMonth,
			&item.EndMonth,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		items = append(items, item)
	}

	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rows.Err().Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

func GetProjectSPHSummary(c *gin.Context) {
	ctx := c.Request.Context()

	where, args := buildProjectAnalyticsFilter(c)
	where = where + " AND COALESCE(p.sph_release_status,'No') = 'Yes'"

	resp := models.ProjectSPHSummaryResponse{
		Statuses: make([]models.ProjectSPHStatusSummary, 0, 5),
		Aging:    make([]models.ProjectSPHAgingBucket, 0, 4),
	}

	statusQuery := fmt.Sprintf(`
		WITH revenue_by_project AS (
			SELECT
				p.id AS project_id,
				%s AS sph_status_norm,
				COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value
			FROM projects p
			LEFT JOIN customers cu ON cu.id = p.customer_id
			LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
			WHERE %s
			GROUP BY p.id, sph_status_norm
		)
		SELECT
			sph_status_norm,
			COUNT(*)::bigint AS count,
			COALESCE(SUM(target_value), 0)::float8 AS target_value,
			COALESCE(AVG(target_value), 0)::float8 AS avg_target_value
		FROM revenue_by_project
		GROUP BY sph_status_norm
		ORDER BY sph_status_norm
	`, normalizedSPHStatusExpr(), where)

	rows, err := database.Pool.Query(ctx, statusQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var item models.ProjectSPHStatusSummary
		if err := rows.Scan(
			&item.Status,
			&item.Count,
			&item.TargetValue,
			&item.AvgTargetValue,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		resp.ReleasedCount += item.Count
		resp.ReleasedValue += item.TargetValue
		resp.Statuses = append(resp.Statuses, item)
	}

	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rows.Err().Error()})
		return
	}

	agingQuery := fmt.Sprintf(`
	WITH revenue_by_project AS (
		SELECT
			p.id AS project_id,
			p.sph_release_date,
			COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value
		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
		  AND p.sph_release_date IS NOT NULL
		  AND (%s) IN ('Open', 'Hold')
		GROUP BY p.id, p.sph_release_date
	),
	aging_base AS (
		SELECT
			CASE
				WHEN CURRENT_DATE - sph_release_date <= 7 THEN '0-7 days'
				WHEN CURRENT_DATE - sph_release_date <= 14 THEN '8-14 days'
				WHEN CURRENT_DATE - sph_release_date <= 30 THEN '15-30 days'
				ELSE '>30 days'
			END AS bucket,
			target_value
		FROM revenue_by_project
	)
	SELECT
		bucket,
		COUNT(*)::bigint AS count,
		COALESCE(SUM(target_value), 0)::float8 AS target_value
	FROM aging_base
	GROUP BY bucket
	ORDER BY
		CASE
			WHEN bucket = '0-7 days' THEN 1
			WHEN bucket = '8-14 days' THEN 2
			WHEN bucket = '15-30 days' THEN 3
			ELSE 4
		END
`, where, normalizedSPHStatusExpr())

	agingRows, err := database.Pool.Query(ctx, agingQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer agingRows.Close()

	for agingRows.Next() {
		var item models.ProjectSPHAgingBucket
		if err := agingRows.Scan(
			&item.Label,
			&item.Count,
			&item.TargetValue,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		resp.Aging = append(resp.Aging, item)
	}

	if agingRows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": agingRows.Err().Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func GetProjectSPHDetails(c *gin.Context) {
	ctx := c.Request.Context()

	where, args := buildProjectAnalyticsFilter(c)
	where = where + " AND COALESCE(p.sph_release_status,'No') = 'Yes'"

	query := fmt.Sprintf(`
		SELECT
			p.id,
			p.project_code,
			COALESCE(p.description, '') AS description,
			COALESCE(cu.name, '') AS customer_name,
			p.division,
			p.status,
			p.project_type,
			p.sales_stage,
			COALESCE(p.sph_release_status, 'Yes') AS sph_release_status,
			p.sph_status,
			p.sph_number,
			p.sph_release_date,
			p.sph_status_reason_category,
			p.sph_status_reason_note,
			COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value,
			COALESCE(SUM(rp.target_realization), 0)::float8 AS realization_value,
			TO_CHAR(MIN(rp.month), 'YYYY-MM') AS start_month,
			TO_CHAR(MAX(rp.month), 'YYYY-MM') AS end_month
		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
		GROUP BY
			p.id, p.project_code, p.description, cu.name,
			p.division, p.status, p.project_type, p.sales_stage,
			p.sph_release_status, p.sph_status, p.sph_number, p.sph_release_date,
			p.sph_status_reason_category, p.sph_status_reason_note
		ORDER BY p.sph_release_date DESC NULLS LAST, target_value DESC, p.project_code ASC
	`, where)

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]models.ProjectPipelineDetailItem, 0)
	for rows.Next() {
		var item models.ProjectPipelineDetailItem
		if err := rows.Scan(
			&item.ID,
			&item.ProjectCode,
			&item.Description,
			&item.CustomerName,
			&item.Division,
			&item.Status,
			&item.ProjectType,
			&item.SalesStage,
			&item.SPHReleaseStatus,
			&item.SPHStatus,
			&item.SPHNumber,
			&item.SPHReleaseDate,
			&item.SPHStatusReasonCategory,
			&item.SPHStatusReasonNote,
			&item.TargetValue,
			&item.RealizationValue,
			&item.StartMonth,
			&item.EndMonth,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		items = append(items, item)
	}

	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rows.Err().Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}
