package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

type DashboardBreakdownItem struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

type DashboardForecastPoint struct {
	Month       string  `json:"month"`
	Target      float64 `json:"target"`
	Realization float64 `json:"realization"`
}

type DashboardPipelineStage struct {
	Stage int    `json:"stage"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type DashboardTopProject struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	TargetRevenue float64 `json:"target_revenue"`
}

type DashboardTotals struct {
	TotalTargetRevenue float64 `json:"total_target_revenue"`
	TotalRealization   float64 `json:"total_realization"`
	TotalProjects      int64   `json:"total_projects"`
}

type DashboardPipeline struct {
	Stages               []DashboardPipelineStage `json:"stages"`
	TotalWeightedRevenue float64                  `json:"total_weighted_revenue"`
}

type DashboardBudget struct {
	TotalBudget      float64 `json:"total_budget"`
	TotalRealization float64 `json:"total_realization"`
}

type DashboardCustomerRow struct {
	Customer    string  `json:"customer"`
	TotalTarget float64 `json:"total_target"`
	TotalReal   float64 `json:"total_real"`
}

// ===================== KPI TYPES (NEW) =====================

type KPIBlock struct {
	Value  float64 `json:"value"`
	Target float64 `json:"target"`
	Pct    float64 `json:"pct"`
}

type OpportunityBlock struct {
	Target     float64 `json:"target"`
	Conversion float64 `json:"conversion"`
}

type DashboardKPIs struct {
	TotalSales   KPIBlock         `json:"total_sales"`
	CarryOver    KPIBlock         `json:"carry_over"`
	ProjectBased KPIBlock         `json:"project_based"`
	Recurring    KPIBlock         `json:"recurring"`
	NewRecurring KPIBlock         `json:"new_recurring"`
	Opportunity  OpportunityBlock `json:"opportunity"`
}

// ==========================================================

type DashboardResponse struct {
	KPIs                 DashboardKPIs            `json:"kpis"` // NEW
	Totals               DashboardTotals          `json:"totals"`
	Pipeline             DashboardPipeline        `json:"pipeline"`
	DivisionBreakdown    []DashboardBreakdownItem `json:"division_breakdown"`
	TypeBreakdown        []DashboardBreakdownItem `json:"type_breakdown"`
	CustomerContribution []DashboardBreakdownItem `json:"customer_contribution"`
	StatusBreakdown      []DashboardBreakdownItem `json:"status_breakdown"`
	Budget               DashboardBudget          `json:"budget"`
	Forecast             []DashboardForecastPoint `json:"forecast"`
	TopProjects          []DashboardTopProject    `json:"top_projects"`
	CustomerTable        []DashboardCustomerRow   `json:"customer_table"`
}

// ===================== Helpers (NEW) =====================

// parse "YYYY-MM" or "YYYY-MM-DD"
func parseYearMonthOrDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date")
	}

	if len(s) == 7 { // YYYY-MM
		return time.Parse("2006-01", s)
	}
	// assume YYYY-MM-DD
	return time.Parse("2006-01-02", s)
}

func startOfMonth(t time.Time, loc *time.Location) time.Time {
	tt := t.In(loc)
	return time.Date(tt.Year(), tt.Month(), 1, 0, 0, 0, 0, loc)
}

func endOfMonth(t time.Time, loc *time.Location) time.Time {
	tt := t.In(loc)
	firstNext := time.Date(tt.Year(), tt.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0)
	return firstNext.Add(-time.Nanosecond)
}

func defaultFiscalYearRange(loc *time.Location) (time.Time, time.Time) {
	now := time.Now().In(loc)
	y := now.Year()
	from := time.Date(y, time.January, 1, 0, 0, 0, 0, loc)
	to := time.Date(y, time.December, 31, 23, 59, 59, 999999999, loc)
	return from, to
}

func pct(v, t float64) float64 {
	if t == 0 {
		return 0
	}
	return (v / t) * 100
}

func conv(real, target float64) float64 {
	if target == 0 {
		return 0
	}
	return real / target
}

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		// fallback aman, jangan panic
		log.Println("WARN: failed to load timezone", name, "fallback to Local:", err)
		return time.Local
	}
	return loc
}

// ==========================================================

func GetDashboard(c *gin.Context) {
	ctx := c.Request.Context()

	// ============================================
	// ROLE + USER DIV
	// ============================================
	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	if role == "user" {
		q := c.Request.URL.Query()
		q.Set("division", userDiv)
		c.Request.URL.RawQuery = q.Encode()
	}

	// ============================================
	// SALES STAGE PROBABILITIES
	// ============================================
	stageProb := map[int]float64{
		1: 0.10,
		2: 0.20,
		3: 0.40,
		4: 0.60,
		5: 0.80,
		6: 1.00,
	}
	stageLabels := map[int]string{
		1: "Prospecting",
		2: "Qualification",
		3: "Presales Analysis",
		4: "Quotation",
		5: "Negotiation",
		6: "Closing",
	}

	// ============================================
	// FILTERS (PROJECT vs BUDGET)
	// ============================================
	projectWhere, projectArgs := buildProjectDashboardFilter(c, role, userDiv)
	budgetWhere, budgetArgs, berr := buildBudgetDashboardFilter(c, role, userDiv)
	if berr != nil {
		c.JSON(400, gin.H{"error": berr.Error()})
		return
	}

	// ============================================
	// KPI BLOCK (NEW) — mengikuti filter (Q1=A, Q2=OK)
	// Total Sales value: real semua status terfilter
	// Total Sales pct: dibanding baseline target (Prospect+Carry Over) dalam filter
	// ============================================
	kpiQuery := fmt.Sprintf(`
		SELECT
			COALESCE(SUM(COALESCE(r.target_realization,0)),0) AS total_sales_real,

			COALESCE(SUM(
				CASE WHEN p.status IN ('Prospect','Carry Over')
				THEN COALESCE(r.target_revenue,0) ELSE 0 END
			),0) AS baseline_target,

			COALESCE(SUM(CASE WHEN p.status='Carry Over' THEN COALESCE(r.target_realization,0) ELSE 0 END),0) AS carry_real,
			COALESCE(SUM(CASE WHEN p.status='Carry Over' THEN COALESCE(r.target_revenue,0) ELSE 0 END),0) AS carry_target,

			COALESCE(SUM(CASE WHEN p.status IN ('Prospect','Carry Over') AND p.project_type='Project Based'
				THEN COALESCE(r.target_realization,0) ELSE 0 END),0) AS pb_real,
			COALESCE(SUM(CASE WHEN p.status IN ('Prospect','Carry Over') AND p.project_type='Project Based'
				THEN COALESCE(r.target_revenue,0) ELSE 0 END),0) AS pb_target,

			COALESCE(SUM(CASE WHEN p.status IN ('Prospect','Carry Over') AND p.project_type='Recurring'
				THEN COALESCE(r.target_realization,0) ELSE 0 END),0) AS rec_real,
			COALESCE(SUM(CASE WHEN p.status IN ('Prospect','Carry Over') AND p.project_type='Recurring'
				THEN COALESCE(r.target_revenue,0) ELSE 0 END),0) AS rec_target,

			COALESCE(SUM(CASE WHEN p.status='New Prospect' AND p.project_type='New Recurring'
				THEN COALESCE(r.target_realization,0) ELSE 0 END),0) AS newrec_real,
			COALESCE(SUM(CASE WHEN p.status='New Prospect' AND p.project_type='New Recurring'
				THEN COALESCE(r.target_revenue,0) ELSE 0 END),0) AS newrec_target,

			COALESCE(SUM(COALESCE(r.target_revenue,0)),0) AS opp_target
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
	`, projectWhere)

	var (
		totalSalesReal, baselineTarget float64
		carryReal, carryTarget         float64
		pbReal, pbTarget               float64
		recReal, recTarget             float64
		newRecReal, newRecTarget       float64
		oppTarget                      float64
	)

	if err := database.Pool.QueryRow(ctx, kpiQuery, projectArgs...).Scan(
		&totalSalesReal,
		&baselineTarget,
		&carryReal, &carryTarget,
		&pbReal, &pbTarget,
		&recReal, &recTarget,
		&newRecReal, &newRecTarget,
		&oppTarget,
	); err != nil {
		log.Println("KPI ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load KPI"})
		return
	}

	kpis := DashboardKPIs{
		TotalSales: KPIBlock{
			Value:  totalSalesReal,
			Target: baselineTarget, // pembanding baseline
			Pct:    pct(totalSalesReal, baselineTarget),
		},
		CarryOver: KPIBlock{
			Value:  carryReal,
			Target: carryTarget,
			Pct:    pct(carryReal, carryTarget),
		},
		ProjectBased: KPIBlock{
			Value:  pbReal,
			Target: pbTarget,
			Pct:    pct(pbReal, pbTarget),
		},
		Recurring: KPIBlock{
			Value:  recReal,
			Target: recTarget,
			Pct:    pct(recReal, recTarget),
		},
		NewRecurring: KPIBlock{
			Value:  newRecReal,
			Target: newRecTarget,
			Pct:    pct(newRecReal, newRecTarget),
		},
		Opportunity: OpportunityBlock{
			Target:     oppTarget,
			Conversion: conv(totalSalesReal, oppTarget),
		},
	}

	// ============================================
	// TOTALS (PROJECT) — tetap existing (untuk kompatibilitas)
	// ============================================
	totalsQuery := fmt.Sprintf(`
		SELECT 
		COALESCE(SUM(r.target_revenue),0)       AS total_target_revenue,
		COALESCE(SUM(r.target_realization),0)   AS total_realization,
		COALESCE(COUNT(DISTINCT p.id),0)        AS total_projects
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		AND p.status IN ('Prospect', 'Carry Over')
	`, projectWhere)

	var totals DashboardTotals
	if err := database.Pool.QueryRow(ctx, totalsQuery, projectArgs...).
		Scan(&totals.TotalTargetRevenue, &totals.TotalRealization, &totals.TotalProjects); err != nil {
		log.Println("TOTALS ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load totals"})
		return
	}

	// ============================================
	// PIPELINE (PROJECT)
	// ============================================
	/*pipelineQuery := fmt.Sprintf(`
		SELECT
			p.sales_stage,
			COUNT(*) AS cnt,
			COALESCE(SUM(COALESCE(r.target_revenue,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY p.sales_stage
		ORDER BY p.sales_stage
	`, projectWhere)*/
	pipelineQuery := fmt.Sprintf(`
		SELECT 
			p.sales_stage,
			COUNT(DISTINCT p.id) AS cnt
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		WHERE %s
		GROUP BY p.sales_stage
		ORDER BY p.sales_stage
	`, projectWhere)

	rowsStage, err := database.Pool.Query(ctx, pipelineQuery, projectArgs...)
	if err != nil {
		log.Println("PIPELINE ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load pipeline"})
		return
	}
	defer rowsStage.Close()

	pipelineStages := make([]DashboardPipelineStage, 6)
	for i := 1; i <= 6; i++ {
		pipelineStages[i-1] = DashboardPipelineStage{Stage: i, Label: stageLabels[i], Count: 0}
	}

	var totalWeighted float64
	for rowsStage.Next() {
		var stage, count int
		var sumRev float64
		if err := rowsStage.Scan(&stage, &count, &sumRev); err != nil {
			continue
		}
		if stage >= 1 && stage <= 6 {
			pipelineStages[stage-1].Count = count
			totalWeighted += sumRev * stageProb[stage]
		}
	}

	// ============================================
	// DIVISION BREAKDOWN (PROJECT)
	// ============================================
	divQuery := fmt.Sprintf(`
		SELECT 
			p.division,
			COALESCE(SUM(COALESCE(r.target_revenue,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY p.division
		ORDER BY p.division
	`, projectWhere)

	rowsDiv, err := database.Pool.Query(ctx, divQuery, projectArgs...)
	if err != nil {
		log.Println("DIV BREAKDOWN ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load division breakdown"})
		return
	}
	defer rowsDiv.Close()

	var divisions []DashboardBreakdownItem
	for rowsDiv.Next() {
		var label string
		var val float64
		_ = rowsDiv.Scan(&label, &val)
		divisions = append(divisions, DashboardBreakdownItem{Label: label, Value: val})
	}

	// ============================================
	// STATUS BREAKDOWN (PROJECT)
	// ============================================
	statusQuery := fmt.Sprintf(`
		SELECT 
			p.status,
			COALESCE(SUM(COALESCE(r.target_revenue,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY p.status
		ORDER BY p.status
	`, projectWhere)

	rowsStatus, err := database.Pool.Query(ctx, statusQuery, projectArgs...)
	if err != nil {
		log.Println("STATUS BREAKDOWN ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load status breakdown"})
		return
	}
	defer rowsStatus.Close()

	var statuses []DashboardBreakdownItem
	for rowsStatus.Next() {
		var label string
		var val float64
		_ = rowsStatus.Scan(&label, &val)
		statuses = append(statuses, DashboardBreakdownItem{Label: label, Value: val})
	}

	// ============================================
	// TYPE BREAKDOWN (PROJECT)
	// ============================================
	typeQuery := fmt.Sprintf(`
		SELECT 
			p.project_type,
			COALESCE(SUM(COALESCE(r.target_revenue,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY p.project_type
		ORDER BY p.project_type
	`, projectWhere)

	rowsType, err := database.Pool.Query(ctx, typeQuery, projectArgs...)
	if err != nil {
		log.Println("TYPE BREAKDOWN ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load type breakdown"})
		return
	}
	defer rowsType.Close()

	var types []DashboardBreakdownItem
	for rowsType.Next() {
		var label string
		var val float64
		_ = rowsType.Scan(&label, &val)
		types = append(types, DashboardBreakdownItem{Label: label, Value: val})
	}

	// ============================================
	// CUSTOMER CONTRIBUTION (PROJECT)
	// ============================================
	custQuery := fmt.Sprintf(`
		SELECT 
			COALESCE(c.name,'Unknown'),
			COALESCE(SUM(COALESCE(r.target_realization,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY c.name
		ORDER BY SUM(COALESCE(r.target_realization,0)) DESC
		LIMIT 6
	`, projectWhere)

	rowsCust, err := database.Pool.Query(ctx, custQuery, projectArgs...)
	if err != nil {
		log.Println("CUST CONTRIB ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load customer contribution"})
		return
	}
	defer rowsCust.Close()

	var customers []DashboardBreakdownItem
	for rowsCust.Next() {
		var label string
		var val float64
		_ = rowsCust.Scan(&label, &val)
		customers = append(customers, DashboardBreakdownItem{Label: label, Value: val})
	}

	// ============================================
	// FORECAST (PROJECT) - monthly
	// ============================================
	forecastQuery := fmt.Sprintf(`
		SELECT 
			to_char(r.month, 'YYYY-MM') AS m,
			COALESCE(
				SUM(
					CASE 
						WHEN p.status IN ('Carry Over', 'Prospect')
						THEN COALESCE(r.target_revenue,0)
						ELSE 0
					END
				), 0
			) AS target,
			COALESCE(SUM(COALESCE(r.target_realization,0)), 0) AS realization
		FROM project_revenue_plan r
		JOIN projects p ON p.id = r.project_id
		LEFT JOIN customers c ON c.id = p.customer_id
		WHERE %s
		GROUP BY m
		ORDER BY m
	`, projectWhere)

	rowsForecast, err := database.Pool.Query(ctx, forecastQuery, projectArgs...)
	if err != nil {
		log.Println("FORECAST ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load forecast"})
		return
	}
	defer rowsForecast.Close()

	var forecast []DashboardForecastPoint
	for rowsForecast.Next() {
		var m string
		var t, real float64
		_ = rowsForecast.Scan(&m, &t, &real)
		forecast = append(forecast, DashboardForecastPoint{Month: m, Target: t, Realization: real})
	}

	// ============================================
	// TOP PROJECTS (PROJECT)
	// ============================================
	topQuery := fmt.Sprintf(`
		SELECT 
			p.id,
			p.description,
			COALESCE(SUM(COALESCE(r.target_revenue,0)),0)
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY p.id, p.description
		ORDER BY SUM(COALESCE(r.target_revenue,0)) DESC
		LIMIT 5
	`, projectWhere)

	rowsTop, err := database.Pool.Query(ctx, topQuery, projectArgs...)
	if err != nil {
		log.Println("TOP PROJECTS ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load top projects"})
		return
	}
	defer rowsTop.Close()

	var topProjects []DashboardTopProject
	for rowsTop.Next() {
		var tp DashboardTopProject
		_ = rowsTop.Scan(&tp.ID, &tp.Name, &tp.TargetRevenue)
		topProjects = append(topProjects, tp)
	}

	// ============================================
	// BUDGET SUMMARY (BUDGET)
	// ============================================
	budgetQuery := fmt.Sprintf(`
		SELECT
			COALESCE(SUM(b.budget_amount), 0) AS total_budget,
			COALESCE(SUM(r.total_realization), 0) AS total_realization
		FROM budgets b
		LEFT JOIN (
			SELECT budget_id, SUM(amount) AS total_realization
			FROM budget_realization
			GROUP BY budget_id
		) r ON r.budget_id = b.id
		WHERE %s
	`, budgetWhere)

	var totalBudget, totalBudgetReal float64
	if err := database.Pool.QueryRow(ctx, budgetQuery, budgetArgs...).Scan(&totalBudget, &totalBudgetReal); err != nil {
		log.Println("BUDGET SUMMARY ERROR:", err)
		log.Println("QUERY:", budgetQuery)
		log.Println("ARGS:", budgetArgs)
		c.JSON(500, gin.H{"error": "failed to load budget summary"})
		return
	}

	// ============================================
	// CUSTOMER TABLE (PROJECT)
	// ============================================
	customerTableQuery := fmt.Sprintf(`
		SELECT 
			COALESCE(c.name, 'Unknown') AS customer,
			COALESCE(SUM(COALESCE(r.target_revenue,0)), 0) AS total_target,
			COALESCE(SUM(COALESCE(r.target_realization,0)), 0) AS total_real
		FROM projects p
		LEFT JOIN customers c ON c.id = p.customer_id
		LEFT JOIN project_revenue_plan r ON r.project_id = p.id
		WHERE %s
		GROUP BY c.name
		ORDER BY total_real DESC
	`, projectWhere)

	rowsCT, err := database.Pool.Query(ctx, customerTableQuery, projectArgs...)
	if err != nil {
		log.Println("CUSTOMER TABLE ERROR:", err)
		c.JSON(500, gin.H{"error": "failed to load customer table"})
		return
	}
	defer rowsCT.Close()

	var customerTable []DashboardCustomerRow
	for rowsCT.Next() {
		var row DashboardCustomerRow
		if err := rowsCT.Scan(&row.Customer, &row.TotalTarget, &row.TotalReal); err == nil {
			customerTable = append(customerTable, row)
		}
	}

	// ============================================
	// SEND RESPONSE
	// ============================================
	resp := DashboardResponse{
		KPIs:   kpis, // NEW
		Totals: totals,
		Pipeline: DashboardPipeline{
			Stages:               pipelineStages,
			TotalWeightedRevenue: totalWeighted,
		},
		DivisionBreakdown:    divisions,
		TypeBreakdown:        types,
		CustomerContribution: customers,
		StatusBreakdown:      statuses,
		Budget: DashboardBudget{
			TotalBudget:      totalBudget,
			TotalRealization: totalBudgetReal,
		},
		Forecast:      forecast,
		TopProjects:   topProjects,
		CustomerTable: customerTable,
	}

	c.JSON(http.StatusOK, resp)
}

// ======================================================================
// FILTER: PROJECT DASHBOARD (alias: p, r, c)
// - support multi status/stage/type
// - default 1 tahun anggaran jika from/to kosong
// ======================================================================
func buildProjectDashboardFilter(c *gin.Context, role, userDiv string) (string, []any) {
	conds := []string{}
	args := []any{}
	i := 1

	// Multi-select
	statuses := c.QueryArray("status")
	stages := c.QueryArray("sales_stage")
	projectTypes := c.QueryArray("project_type")

	// Single
	division := NormalizeDivision(strings.TrimSpace(c.Query("division")))
	customer := strings.TrimSpace(c.Query("customer"))

	fromStr := strings.TrimSpace(c.Query("from")) // "YYYY-MM" or "YYYY-MM-DD"
	toStr := strings.TrimSpace(c.Query("to"))     // "YYYY-MM" or "YYYY-MM-DD"

	if role == "user" {
		division = userDiv
	}

	// timezone for fiscal year default
	loc := mustLoadLocation("Asia/Jakarta")

	// DEFAULT fiscal year if empty
	var (
		fromDate time.Time
		toDate   time.Time
	)
	if fromStr == "" && toStr == "" {
		df, dt := defaultFiscalYearRange(loc)
		fromDate, toDate = df, dt
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
		// if only one side exists, clamp to fiscal year of that side
		if !fromDate.IsZero() && toDate.IsZero() {
			y := fromDate.In(loc).Year()
			toDate = time.Date(y, time.December, 31, 23, 59, 59, 999999999, loc)
		}
		if fromDate.IsZero() && !toDate.IsZero() {
			y := toDate.In(loc).Year()
			fromDate = time.Date(y, time.January, 1, 0, 0, 0, 0, loc)
		}
	}

	// STATUS (multi)
	if len(statuses) > 0 && !(len(statuses) == 1 && strings.ToUpper(statuses[0]) == "ALL") {
		holders := []string{}
		for _, s := range statuses {
			holders = append(holders, fmt.Sprintf("$%d", i))
			args = append(args, s)
			i++
		}
		conds = append(conds, fmt.Sprintf("p.status IN (%s)", strings.Join(holders, ",")))
	}

	// STAGE (multi int)
	if len(stages) > 0 && !(len(stages) == 1 && strings.ToUpper(stages[0]) == "ALL") {
		holders := []string{}
		for _, s := range stages {
			if _, err := strconv.Atoi(s); err == nil {
				holders = append(holders, fmt.Sprintf("$%d", i))
				args = append(args, s)
				i++
			}
		}
		if len(holders) > 0 {
			conds = append(conds, fmt.Sprintf("p.sales_stage IN (%s)", strings.Join(holders, ",")))
		}
	}

	// TYPE (multi)
	if len(projectTypes) > 0 && !(len(projectTypes) == 1 && strings.ToUpper(projectTypes[0]) == "ALL") {
		holders := []string{}
		for _, t := range projectTypes {
			holders = append(holders, fmt.Sprintf("$%d", i))
			args = append(args, t)
			i++
		}
		conds = append(conds, fmt.Sprintf("p.project_type IN (%s)", strings.Join(holders, ",")))
	}

	if division != "" && strings.ToUpper(division) != "ALL" {
		conds = append(conds, fmt.Sprintf("p.division = $%d", i))
		args = append(args, division)
		i++
	}

	if customer != "" && strings.ToUpper(customer) != "ALL" {
		conds = append(conds, fmt.Sprintf("COALESCE(c.name,'') = $%d", i))
		args = append(args, customer)
		i++
	}

	// date range always applied (1 fiscal year)
	if !fromDate.IsZero() {
		conds = append(conds, fmt.Sprintf("r.month >= $%d", i))
		args = append(args, fromDate.UTC())
		i++
	}
	if !toDate.IsZero() {
		conds = append(conds, fmt.Sprintf("r.month <= $%d", i))
		args = append(args, toDate.UTC())
		i++
	}

	if len(conds) == 0 {
		return "1=1", nil
	}
	return strings.Join(conds, " AND "), args
}

// ======================================================================
// FILTER: BUDGET DASHBOARD (alias: b)
// - division + default 1 tahun anggaran jika from/to kosong
// ======================================================================
func buildBudgetDashboardFilter(c *gin.Context, role, userDiv string) (string, []any, error) {
	var (
		conds []string
		args  []any
		i     = 1
	)

	divFilter := strings.TrimSpace(c.Query("division"))
	fromStr := strings.TrimSpace(c.Query("from"))
	toStr := strings.TrimSpace(c.Query("to"))

	if role == "user" {
		divFilter = userDiv
	}
	divFilter = NormalizeDivision(divFilter)

	loc := mustLoadLocation("Asia/Jakarta")

	// DEFAULT fiscal year if empty
	var (
		fromDate time.Time
		toDate   time.Time
	)
	if fromStr == "" && toStr == "" {
		df, dt := defaultFiscalYearRange(loc)
		fromDate, toDate = df, dt
	} else {
		if fromStr != "" {
			t, err := parseYearMonthOrDate(fromStr)
			if err != nil {
				return "", nil, fmt.Errorf("invalid from (use YYYY-MM or YYYY-MM-DD)")
			}
			fromDate = startOfMonth(t, loc)
		}
		if toStr != "" {
			t, err := parseYearMonthOrDate(toStr)
			if err != nil {
				return "", nil, fmt.Errorf("invalid to (use YYYY-MM or YYYY-MM-DD)")
			}
			// b.month is DATE; still ok to use month end date
			toDate = endOfMonth(t, loc)
		}

		if !fromDate.IsZero() && toDate.IsZero() {
			y := fromDate.In(loc).Year()
			toDate = time.Date(y, time.December, 31, 0, 0, 0, 0, loc)
		}
		if fromDate.IsZero() && !toDate.IsZero() {
			y := toDate.In(loc).Year()
			fromDate = time.Date(y, time.January, 1, 0, 0, 0, 0, loc)
		}
	}

	if divFilter != "" && strings.ToUpper(divFilter) != "ALL" {
		conds = append(conds, fmt.Sprintf("b.division = $%d", i))
		args = append(args, divFilter)
		i++
	}

	// apply fiscal-year range
	if !fromDate.IsZero() {
		conds = append(conds, fmt.Sprintf("b.month >= $%d", i))
		args = append(args, fromDate.UTC())
		i++
	}
	if !toDate.IsZero() {
		conds = append(conds, fmt.Sprintf("b.month <= $%d", i))
		// b.month DATE - use date only (UTC ok)
		args = append(args, toDate.UTC())
		i++
	}

	if len(conds) == 0 {
		return "1=1", nil, nil
	}

	return strings.Join(conds, " AND "), args, nil
}
