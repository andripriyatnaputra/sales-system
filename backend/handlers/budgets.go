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

// ======================================================
// CREATE BUDGET
// ======================================================

func CreateBudget(c *gin.Context) {
	var req models.CreateBudgetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	// user wajib memakai division dari token
	if role == "user" {
		req.Division = userDiv
	}

	req.Division = NormalizeDivision(req.Division)

	if !isValidDivision(req.Division) {
		c.JSON(400, gin.H{"error": "invalid division"})
		return
	}

	monthDate, err := time.Parse("2006-01", req.Month)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid month format"})
		return
	}

	// cek duplicate budget (division + month)
	exists, _ := BudgetExists(c, req.Division, monthDate)
	if exists {
		c.JSON(409, gin.H{"error": "Budget for this month & division already exists"})
		return
	}

	// insert budget
	var id int64
	err = database.Pool.QueryRow(
		c,
		`INSERT INTO budgets (division, month, budget_amount)
		 VALUES ($1, $2, $3) RETURNING id`,
		req.Division,
		monthDate,
		req.BudgetAmount,
	).Scan(&id)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"id": id})
}

// ======================================================
// ADD REALIZATION
// ======================================================

func AddRealization(c *gin.Context) {
	budgetID, err := strconv.ParseInt(c.Param("budgetId"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid budget id"})
		return
	}

	var req models.AddRealizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	if req.Amount <= 0 {
		c.JSON(400, gin.H{"error": "amount must be > 0"})
		return
	}

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	var budgetDiv string
	err = database.Pool.QueryRow(
		c,
		`SELECT division FROM budgets WHERE id=$1`,
		budgetID,
	).Scan(&budgetDiv)

	if err != nil {
		c.JSON(404, gin.H{"error": "budget not found"})
		return
	}

	if role == "user" && NormalizeDivision(budgetDiv) != userDiv {
		c.JSON(403, gin.H{"error": "forbidden"})
		return
	}

	_, err = database.Pool.Exec(
		c,
		`
		INSERT INTO budget_realization (budget_id, category, amount, note)
		VALUES ($1, $2, $3, $4)
		`,
		budgetID,
		req.Category,
		req.Amount,
		req.Note,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"status": "created"})
}

// ======================================================
// UPDATE BUDGET AMOUNT
// ======================================================

func UpdateBudget(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	var req models.UpdateBudgetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid body"})
		return
	}

	// cek kalau realisasi sudah lebih besar dari budget baru
	totalReal, _ := GetTotalRealization(c, id)
	if req.BudgetAmount < totalReal {
		c.JSON(400, gin.H{
			"error":             "Budget amount cannot be less than current total realization",
			"total_realization": totalReal,
		})
		return
	}

	_, err := database.Pool.Exec(
		c,
		`UPDATE budgets
		 SET budget_amount=$1, updated_at=NOW()
		 WHERE id=$2`,
		req.BudgetAmount, id,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "ok"})
}

// ======================================================
// LIST BUDGETS (ACL APPLIED)
// ======================================================

func ListBudgets(c *gin.Context) {
	division := NormalizeDivision(c.Query("division"))
	year := c.Query("year")

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	// user hanya bisa lihat division-nya sendiri
	if role == "user" {
		division = userDiv
	}

	rows, err := database.Pool.Query(
		c,
		`SELECT id, division, month, budget_amount, created_at, updated_at
		 FROM budgets
		 WHERE ($1='' OR division=$1)
		   AND ($2='' OR EXTRACT(YEAR FROM month)=CAST($2 AS INT))
		 ORDER BY month`,
		division, year,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var budgets []models.Budget

	for rows.Next() {
		var b models.Budget
		var month time.Time

		rows.Scan(&b.ID, &b.Division, &month, &b.BudgetAmount, &b.CreatedAt, &b.UpdatedAt)
		b.Division = NormalizeDivision(b.Division)
		b.Month = month.Format("2006-01")

		totalReal, _ := GetTotalRealization(c, b.ID)
		b.TotalRealization = totalReal
		b.Remaining = b.BudgetAmount - totalReal
		if b.BudgetAmount > 0 {
			b.Achievement = (totalReal / b.BudgetAmount) * 100
		}

		budgets = append(budgets, b)
	}

	c.JSON(200, budgets)
}

// ======================================================
// GET BUDGET DETAIL + ACL
// ======================================================

func GetBudgetDetail(c *gin.Context) {
	budgetID, err := strconv.ParseInt(c.Param("budgetId"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid budget id"})
		return
	}

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	var b models.Budget
	var month time.Time

	err = database.Pool.QueryRow(
		c,
		`
		SELECT id, division, month, budget_amount, created_at, updated_at
		FROM budgets
		WHERE id=$1
		`,
		budgetID,
	).Scan(&b.ID, &b.Division, &month, &b.BudgetAmount, &b.CreatedAt, &b.UpdatedAt)

	if err != nil {
		c.JSON(404, gin.H{"error": "budget not found"})
		return
	}

	b.Division = NormalizeDivision(b.Division)
	b.Month = month.Format("2006-01")

	// ACL
	if role == "user" && b.Division != userDiv {
		c.JSON(403, gin.H{"error": "forbidden"})
		return
	}

	rows, err := database.Pool.Query(
		c,
		`
		SELECT id, category, amount, note, created_at, updated_at
		FROM budget_realization
		WHERE budget_id=$1
		ORDER BY created_at DESC
		`,
		budgetID,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var details []models.BudgetRealization
	total := float64(0)

	for rows.Next() {
		var r models.BudgetRealization
		if err := rows.Scan(
			&r.ID,
			&r.Category,
			&r.Amount,
			&r.Note,
			&r.CreatedAt,
			&r.UpdatedAt,
		); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		details = append(details, r)
		total += r.Amount
	}

	b.TotalRealization = total
	b.Remaining = b.BudgetAmount - total

	if b.BudgetAmount > 0 {
		b.Achievement = (total / b.BudgetAmount) * 100
	}

	c.JSON(200, gin.H{
		"budget":      b,
		"realization": details,
	})
}

// ======================================================
// UPDATE REALIZATION
// ======================================================

func UpdateRealization(c *gin.Context) {
	realID, err := strconv.ParseInt(c.Param("realizationId"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid realization id"})
		return
	}

	budgetID, err := strconv.ParseInt(c.Param("budgetId"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid budget id"})
		return
	}

	var req struct {
		Category *string  `json:"category"`
		Amount   *float64 `json:"amount"`
		Note     *string  `json:"note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	if req.Amount != nil && *req.Amount <= 0 {
		c.JSON(400, gin.H{"error": "amount must be > 0"})
		return
	}

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	var budgetDivision string
	err = database.Pool.QueryRow(
		c,
		`
		SELECT b.division
		FROM budget_realization br
		JOIN budgets b ON b.id = br.budget_id
		WHERE br.id=$1 AND b.id=$2
		`,
		realID,
		budgetID,
	).Scan(&budgetDivision)

	if err != nil {
		c.JSON(404, gin.H{"error": "realization not found"})
		return
	}

	if role == "user" && NormalizeDivision(budgetDivision) != userDiv {
		c.JSON(403, gin.H{"error": "forbidden"})
		return
	}

	_, err = database.Pool.Exec(
		c,
		`
		UPDATE budget_realization
		   SET category = COALESCE($1, category),
		       amount   = COALESCE($2, amount),
		       note     = COALESCE($3, note),
		       updated_at = NOW()
		 WHERE id=$4 AND budget_id=$5
		`,
		req.Category,
		req.Amount,
		req.Note,
		realID,
		budgetID,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "ok"})
}

// ======================================================
// DELETE REALIZATION
// ======================================================

func DeleteRealization(c *gin.Context) {
	realID, _ := strconv.ParseInt(c.Param("realizationId"), 10, 64)
	budgetID, _ := strconv.ParseInt(c.Param("budgetId"), 10, 64)

	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	var budgetDiv string
	err := database.Pool.QueryRow(
		c,
		`
		SELECT b.division
		FROM budget_realization br
		JOIN budgets b ON b.id = br.budget_id
		WHERE br.id=$1 AND b.id=$2
		`,
		realID,
		budgetID,
	).Scan(&budgetDiv)

	if err != nil {
		c.JSON(404, gin.H{"error": "realization not found"})
		return
	}

	if role == "user" && NormalizeDivision(budgetDiv) != userDiv {
		c.JSON(403, gin.H{"error": "forbidden"})
		return
	}

	_, err = database.Pool.Exec(
		c,
		`DELETE FROM budget_realization WHERE id=$1 AND budget_id=$2`,
		realID,
		budgetID,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "deleted"})
}

// ======================================================
// BUDGET TREND
// ======================================================

func GetBudgetTrend(c *gin.Context) {
	role := c.GetString("role")
	userDiv := NormalizeDivision(c.GetString("division"))

	// Query params
	division := NormalizeDivision(strings.TrimSpace(c.Query("division")))
	yearStr := strings.TrimSpace(c.Query("year"))

	if yearStr == "" {
		c.JSON(400, gin.H{"error": "year is required"})
		return
	}

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid year"})
		return
	}

	// ROLE-BASED: user forced to own division
	if role == "user" {
		division = userDiv
	}

	// Admin boleh ALL, tapi FE selalu kirim division spesifik
	if division == "" || strings.ToUpper(division) == "ALL" {
		c.JSON(400, gin.H{"error": "division is required"})
		return
	}

	// Build date range for year (index-friendly)
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, 12, 31, 23, 59, 59, 999999999, time.UTC)

	rows, err := database.Pool.Query(
		c,
		`
		SELECT
			to_char(b.month, 'YYYY-MM') AS month,
			b.budget_amount,
			COALESCE(SUM(br.amount), 0) AS realization
		FROM budgets b
		LEFT JOIN budget_realization br ON br.budget_id = b.id
		WHERE b.division = $1
		  AND b.month BETWEEN $2 AND $3
		GROUP BY b.id, b.month, b.budget_amount
		ORDER BY b.month ASC
		`,
		division, start, end,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type TrendRow struct {
		Month       string  `json:"month"`
		Budget      float64 `json:"budget"`
		Realization float64 `json:"realization"`
	}

	var result []TrendRow
	for rows.Next() {
		var t TrendRow
		if err := rows.Scan(&t.Month, &t.Budget, &t.Realization); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		result = append(result, t)
	}

	c.JSON(http.StatusOK, gin.H{"trend": result})
}
