package handlers

import (
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListProjectAdditionalCosts: read terbuka, sama prinsip modul lain (Presales,
// PO) yang membaca tidak digate departemen.
func ListProjectAdditionalCosts(c *gin.Context) {
	projectID := c.Param("id")

	rows, err := database.Pool.Query(c, `
		SELECT pac.id, pac.project_id, pac.description, pac.amount, pac.incurred_date,
		       pac.created_by, COALESCE(u.username, ''), pac.notes, pac.created_at, pac.updated_at
		FROM project_additional_costs pac
		LEFT JOIN users u ON u.id = pac.created_by
		WHERE pac.project_id = $1
		ORDER BY pac.created_at DESC
	`, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.ProjectAdditionalCost{}
	for rows.Next() {
		var pac models.ProjectAdditionalCost
		if err := rows.Scan(&pac.ID, &pac.ProjectID, &pac.Description, &pac.Amount, &pac.IncurredDate,
			&pac.CreatedBy, &pac.CreatedByUsername, &pac.Notes, &pac.CreatedAt, &pac.UpdatedAt); err == nil {
			list = append(list, pac)
		}
	}

	c.JSON(http.StatusOK, list)
}

// CreateProjectAdditionalCost: Finance only -- konsisten dengan peran Finance
// yang sudah pegang budgets & bagian P&L presales.
func CreateProjectAdditionalCost(c *gin.Context) {
	projectID := c.Param("id")
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa menambah additional cost"})
		return
	}

	var body struct {
		Description  string `json:"description"`
		Amount       float64 `json:"amount"`
		IncurredDate string `json:"incurred_date"`
		Notes        string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Description == "" || body.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description dan amount (>0) wajib diisi"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO project_additional_costs (project_id, description, amount, incurred_date, created_by, notes)
		VALUES ($1, $2, $3, NULLIF($4, '')::date, $5, NULLIF($6, ''))
		RETURNING id
	`, projectID, body.Description, body.Amount, body.IncurredDate, c.GetInt64("user_id"), body.Notes).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "project_additional_cost", strconv.FormatInt(id, 10), body.Description, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateProjectAdditionalCost(c *gin.Context) {
	costID := c.Param("costId")
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa mengubah additional cost"})
		return
	}

	var body struct {
		Description  *string  `json:"description"`
		Amount       *float64 `json:"amount"`
		IncurredDate *string  `json:"incurred_date"`
		Notes        *string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE project_additional_costs
		SET description = COALESCE($1, description),
		    amount = COALESCE($2, amount),
		    incurred_date = COALESCE($3::date, incurred_date),
		    notes = COALESCE($4, notes),
		    updated_at = NOW()
		WHERE id = $5
	`, body.Description, body.Amount, body.IncurredDate, body.Notes, costID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "additional cost tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "project_additional_cost", costID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteProjectAdditionalCost(c *gin.Context) {
	costID := c.Param("costId")
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa menghapus additional cost"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `DELETE FROM project_additional_costs WHERE id = $1`, costID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "additional cost tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "project_additional_cost", costID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
