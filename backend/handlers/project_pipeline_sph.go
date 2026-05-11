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
	sphReleaseRange := strings.TrimSpace(c.Query("sph_release_range"))

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

	if sphReleaseRange != "" && strings.ToUpper(sphReleaseRange) != "ALL" {
		switch sphReleaseRange {
		case "last_week":
			conds = append(conds, "p.sph_release_date >= (CURRENT_DATE - INTERVAL '7 days')")
			conds = append(conds, "p.sph_release_date <= CURRENT_DATE")
			conds = append(conds, "COALESCE(p.sph_release_status, 'No') = 'Yes'")

		case "last_2_weeks":
			conds = append(conds, "p.sph_release_date >= (CURRENT_DATE - INTERVAL '14 days')")
			conds = append(conds, "p.sph_release_date <= CURRENT_DATE")
			conds = append(conds, "COALESCE(p.sph_release_status, 'No') = 'Yes'")

		case "last_month":
			conds = append(conds, "p.sph_release_date >= (CURRENT_DATE - INTERVAL '1 month')")
			conds = append(conds, "p.sph_release_date <= CURRENT_DATE")
			conds = append(conds, "COALESCE(p.sph_release_status, 'No') = 'Yes'")

		case "ytd":
			conds = append(conds, "p.sph_release_date >= DATE_TRUNC('year', CURRENT_DATE)")
			conds = append(conds, "p.sph_release_date <= CURRENT_DATE")
			conds = append(conds, "COALESCE(p.sph_release_status, 'No') = 'Yes'")
		}
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
				%s AS sph_status_norm,
				COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value,
				COALESCE(SUM(rp.sph_revenue), 0)::float8 AS sph_value,
				COALESCE(SUM(rp.target_realization), 0)::float8 AS realization_value
			FROM projects p
			LEFT JOIN customers cu ON cu.id = p.customer_id
			LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
			WHERE %s
			GROUP BY p.id, p.sales_stage, p.sph_status
		)
		SELECT
			sales_stage,
			COUNT(*)::bigint AS count,
			COALESCE(SUM(target_value), 0)::float8 AS target_value,
			COALESCE(SUM(sph_value), 0)::float8 AS sph_value,
			COALESCE(SUM(realization_value), 0)::float8 AS realization_value,
			COALESCE(AVG(target_value), 0)::float8 AS avg_target_value,
			COUNT(*) FILTER (WHERE sph_status_norm = 'Hold')::bigint AS hold_count,
			COALESCE(SUM(sph_value) FILTER (WHERE sph_status_norm = 'Hold'), 0)::float8 AS hold_value,
			COUNT(*) FILTER (WHERE sph_status_norm = 'Loss')::bigint AS loss_count,
			COALESCE(SUM(sph_value) FILTER (WHERE sph_status_norm = 'Loss'), 0)::float8 AS loss_value,
			COUNT(*) FILTER (WHERE sph_status_norm = 'Drop')::bigint AS drop_count,
			COALESCE(SUM(sph_value) FILTER (WHERE sph_status_norm = 'Drop'), 0)::float8 AS drop_value
		FROM revenue_by_project
		WHERE sales_stage BETWEEN 1 AND 6
		GROUP BY sales_stage
		ORDER BY sales_stage
	`, normalizedSPHStatusExpr(), where)

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
			&item.SPHValue,
			&item.RealizationValue,
			&item.AvgTargetValue,
			&item.HoldCount,
			&item.HoldValue,
			&item.LossCount,
			&item.LossValue,
			&item.DropCount,
			&item.DropValue,
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
			COALESCE(SUM(rp.sph_revenue), 0)::float8 AS sph_value,
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
			&item.SPHValue,
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

	// optional filter
	division := NormalizeDivision(c.Query("division"))

	where := "p.sph_release_status = 'Yes'"
	args := []interface{}{}
	idx := 1

	if division != "" && division != "All" {
		where += fmt.Sprintf(" AND p.division = $%d", idx)
		args = append(args, division)
		idx++
	}

	query := fmt.Sprintf(`
		SELECT
			COUNT(DISTINCT p.id)::bigint AS released_count,
			COALESCE(SUM(rp.target_revenue), 0)::float8 AS initial_target_value,
			COALESCE(SUM(rp.sph_revenue), 0)::float8 AS sph_value,
			COALESCE(SUM(rp.sph_revenue - rp.target_revenue), 0)::float8 AS variance_value,
			COALESCE(SUM(rp.target_realization), 0)::float8 AS realization_value,
			CASE
				WHEN COALESCE(SUM(rp.sph_revenue), 0) = 0 THEN 0
				ELSE (
					COALESCE(SUM(rp.target_realization), 0)
					/ COALESCE(SUM(rp.sph_revenue), 0)
				) * 100
			END::float8 AS conversion_rate
		FROM projects p
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
	`, where)

	var res models.ProjectSPHSummaryResponse

	err := database.Pool.QueryRow(ctx, query, args...).Scan(
		&res.ReleasedCount,
		&res.InitialTargetValue,
		&res.SPHValue,
		&res.VarianceValue,
		&res.RealizationValue,
		&res.ConversionRate,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// =========================
	// STATUS BREAKDOWN
	// =========================

	statusQuery := fmt.Sprintf(`
		SELECT
			CASE
				WHEN lower(COALESCE(p.sph_status,'')) = 'win' THEN 'Win'
				WHEN lower(COALESCE(p.sph_status,'')) = 'hold' THEN 'Hold'
				WHEN lower(COALESCE(p.sph_status,'')) = 'loss' THEN 'Loss'
				WHEN lower(COALESCE(p.sph_status,'')) = 'drop' THEN 'Drop'
				ELSE 'Open'
			END AS status,
			COUNT(DISTINCT p.id)::bigint AS count,
			COALESCE(SUM(rp.sph_revenue), 0)::float8 AS target_value,
			CASE
				WHEN COUNT(DISTINCT p.id) = 0 THEN 0
				ELSE COALESCE(SUM(rp.sph_revenue), 0) / COUNT(DISTINCT p.id)
			END::float8 AS avg_target_value
		FROM projects p
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
		GROUP BY p.sph_status
	`, where)

	rows, err := database.Pool.Query(ctx, statusQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var statuses []models.ProjectSPHStatusSummary

	for rows.Next() {
		var s models.ProjectSPHStatusSummary
		if err := rows.Scan(
			&s.Status,
			&s.Count,
			&s.TargetValue,
			&s.AvgTargetValue,
		); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		statuses = append(statuses, s)
	}

	if rows.Err() != nil {
		c.JSON(500, gin.H{"error": rows.Err().Error()})
		return
	}

	res.Statuses = statuses

	// =========================
	// AGING - Open/Hold only
	// =========================

	agingQuery := fmt.Sprintf(`
		WITH base AS (
			SELECT
				p.id,
				p.sph_release_date,
				COALESCE(SUM(rp.sph_revenue), 0)::float8 AS target_value,
				CASE
					WHEN lower(COALESCE(p.sph_status,'')) = 'win' THEN 'Win'
					WHEN lower(COALESCE(p.sph_status,'')) = 'hold' THEN 'Hold'
					WHEN lower(COALESCE(p.sph_status,'')) = 'loss' THEN 'Loss'
					WHEN lower(COALESCE(p.sph_status,'')) = 'drop' THEN 'Drop'
					ELSE 'Open'
				END AS status
			FROM projects p
			LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
			WHERE %s
			  AND p.sph_release_date IS NOT NULL
			GROUP BY p.id, p.sph_release_date, p.sph_status
		),
		filtered AS (
			SELECT *
			FROM base
			WHERE status IN ('Open','Hold')
		),
		bucketed AS (
			SELECT
				CASE
					WHEN CURRENT_DATE - sph_release_date <= 7 THEN '0-7 days'
					WHEN CURRENT_DATE - sph_release_date <= 14 THEN '8-14 days'
					WHEN CURRENT_DATE - sph_release_date <= 30 THEN '15-30 days'
					ELSE '>30 days'
				END AS bucket,
				target_value
			FROM filtered
		)
		SELECT
			bucket,
			COUNT(*)::bigint,
			COALESCE(SUM(target_value), 0)::float8
		FROM bucketed
		GROUP BY bucket
		ORDER BY
			CASE
				WHEN bucket = '0-7 days' THEN 1
				WHEN bucket = '8-14 days' THEN 2
				WHEN bucket = '15-30 days' THEN 3
				ELSE 4
			END
	`, where)

	rows2, err := database.Pool.Query(ctx, agingQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows2.Close()

	var aging []models.ProjectSPHAgingBucket

	for rows2.Next() {
		var a models.ProjectSPHAgingBucket
		if err := rows2.Scan(
			&a.Label,
			&a.Count,
			&a.TargetValue,
		); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		aging = append(aging, a)
	}

	if rows2.Err() != nil {
		c.JSON(500, gin.H{"error": rows2.Err().Error()})
		return
	}

	res.Aging = aging

	// =========================
	// LOSS / DROP REASON BREAKDOWN
	// =========================

	reasonQuery := fmt.Sprintf(`
		SELECT
			COALESCE(NULLIF(p.sph_status_reason_category, ''), 'Unspecified') AS reason,
			COUNT(DISTINCT p.id)::bigint AS count,
			COALESCE(SUM(rp.sph_revenue), 0)::float8 AS sph_value,
			COALESCE(SUM(rp.target_revenue), 0)::float8 AS target_value
		FROM projects p
		LEFT JOIN project_revenue_plan rp ON rp.project_id = p.id
		WHERE %s
		  AND lower(COALESCE(p.sph_status,'')) IN ('loss','drop')
		GROUP BY COALESCE(NULLIF(p.sph_status_reason_category, ''), 'Unspecified')
		ORDER BY sph_value DESC, count DESC
	`, where)

	rows3, err := database.Pool.Query(ctx, reasonQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows3.Close()

	var reasons []models.ProjectSPHReasonSummary

	for rows3.Next() {
		var r models.ProjectSPHReasonSummary
		if err := rows3.Scan(
			&r.Reason,
			&r.Count,
			&r.SPHValue,
			&r.TargetValue,
		); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		reasons = append(reasons, r)
	}

	if rows3.Err() != nil {
		c.JSON(500, gin.H{"error": rows3.Err().Error()})
		return
	}

	res.Reasons = reasons

	c.JSON(200, res)
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
			COALESCE(SUM(rp.sph_revenue), 0)::float8 AS sph_value,
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
			&item.SPHValue,
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
