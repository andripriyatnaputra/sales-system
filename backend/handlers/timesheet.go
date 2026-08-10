package handlers

import (
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListProjectTimesheets: division-scoped (checkProjectDivisionAccess, sama
// pola project_documents.go) -- read TIDAK PERNAH sertakan hourly_rate/cost
// (privasi, mirip data gaji). Cost cuma muncul sbg satu angka agregat per
// project di Project Profitability (labor_cost).
func ListProjectTimesheets(c *gin.Context) {
	projectID := c.Param("id")

	ok, err := checkProjectDivisionAccess(c, projectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: cannot access project in another division"})
		return
	}

	rows, err := database.Pool.Query(c, `
		SELECT ts.id, ts.project_id, ts.user_id, COALESCE(u.username, ''), ts.work_date, ts.hours, ts.description, ts.created_at, ts.updated_at
		FROM timesheets ts
		LEFT JOIN users u ON u.id = ts.user_id
		WHERE ts.project_id = $1
		ORDER BY ts.work_date DESC, ts.id DESC
	`, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.Timesheet{}
	for rows.Next() {
		var t models.Timesheet
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.UserID, &t.Username, &t.WorkDate, &t.Hours, &t.Description, &t.CreatedAt, &t.UpdatedAt); err == nil {
			list = append(list, t)
		}
	}

	c.JSON(http.StatusOK, list)
}

// ListMyTimesheets: self-scoped lintas-project, dipakai halaman "Timesheet
// Saya" -- filter tanggal opsional.
func ListMyTimesheets(c *gin.Context) {
	userID := c.GetInt64("user_id")
	from := c.Query("from")
	to := c.Query("to")

	query := `
		SELECT ts.id, ts.project_id, COALESCE(p.project_code, ''), ts.user_id, ts.work_date, ts.hours, ts.description, ts.created_at, ts.updated_at
		FROM timesheets ts
		LEFT JOIN projects p ON p.id = ts.project_id
		WHERE ts.user_id = $1
	`
	args := []interface{}{userID}
	if from != "" {
		args = append(args, from)
		query += " AND ts.work_date >= $" + strconv.Itoa(len(args))
	}
	if to != "" {
		args = append(args, to)
		query += " AND ts.work_date <= $" + strconv.Itoa(len(args))
	}
	query += " ORDER BY ts.work_date DESC, ts.id DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.Timesheet{}
	for rows.Next() {
		var t models.Timesheet
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.ProjectCode, &t.UserID, &t.WorkDate, &t.Hours, &t.Description, &t.CreatedAt, &t.UpdatedAt); err == nil {
			list = append(list, t)
		}
	}

	c.JSON(http.StatusOK, list)
}

// CreateTimesheet: self-only (user_id SELALU dari token, bukan dari body) --
// tidak ada cara log jam org lain, jadi tidak perlu department gate, semua
// orang login boleh log jam sendiri ke project yang dia punya akses.
func CreateTimesheet(c *gin.Context) {
	projectID := c.Param("id")

	ok, err := checkProjectDivisionAccess(c, projectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: cannot access project in another division"})
		return
	}

	var body struct {
		WorkDate    string  `json:"work_date"`
		Hours       float64 `json:"hours"`
		Description string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.WorkDate == "" || body.Hours <= 0 || body.Hours > 24 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "work_date wajib diisi dan hours harus di antara 0-24"})
		return
	}

	var id int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO timesheets (project_id, user_id, work_date, hours, description)
		VALUES ($1, $2, $3::date, $4, NULLIF($5, ''))
		RETURNING id
	`, projectID, c.GetInt64("user_id"), body.WorkDate, body.Hours, body.Description).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "timesheet", strconv.FormatInt(id, 10), body.Description, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateTimesheet/DeleteTimesheet: pemilik entri sendiri atau admin -- pola
// sama DeleteProjectDocument ("uploader atau admin").
func UpdateTimesheet(c *gin.Context) {
	tsID := c.Param("tsId")

	var ownerID int64
	if err := database.Pool.QueryRow(c, `SELECT user_id FROM timesheets WHERE id = $1`, tsID).Scan(&ownerID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "timesheet tidak ditemukan"})
		return
	}
	if ownerID != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya pemilik entri atau admin yang bisa mengubah"})
		return
	}

	var body struct {
		WorkDate    *string  `json:"work_date"`
		Hours       *float64 `json:"hours"`
		Description *string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Hours != nil && (*body.Hours <= 0 || *body.Hours > 24) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hours harus di antara 0-24"})
		return
	}

	_, err := database.Pool.Exec(c, `
		UPDATE timesheets
		SET work_date = COALESCE($1::date, work_date),
		    hours = COALESCE($2, hours),
		    description = COALESCE($3, description),
		    updated_at = NOW()
		WHERE id = $4
	`, body.WorkDate, body.Hours, body.Description, tsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "timesheet", tsID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteTimesheet(c *gin.Context) {
	tsID := c.Param("tsId")

	var ownerID int64
	if err := database.Pool.QueryRow(c, `SELECT user_id FROM timesheets WHERE id = $1`, tsID).Scan(&ownerID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "timesheet tidak ditemukan"})
		return
	}
	if ownerID != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya pemilik entri atau admin yang bisa menghapus"})
		return
	}

	_, err := database.Pool.Exec(c, `DELETE FROM timesheets WHERE id = $1`, tsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "timesheet", tsID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

type userRateRow struct {
	ID         int64    `json:"id"`
	Username   string   `json:"username"`
	Division   string   `json:"division"`
	HourlyRate *float64 `json:"hourly_rate"`
}

// ListUsersForRateManagement: endpoint RINGAN khusus Finance/HR GA & Legal --
// BUKAN reuse GET /users (digate middleware.RequirePermission("users.manage"),
// jalur admin yang belum tentu dipegang Finance/HR GA & Legal).
func ListUsersForRateManagement(c *gin.Context) {
	if !requireDepartment(c, "Finance") && !requireDepartment(c, "HR GA & Legal") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance/HR GA & Legal yang bisa lihat rate tenaga kerja"})
		return
	}

	rows, err := database.Pool.Query(c, `SELECT id, username, division, hourly_rate FROM users ORDER BY username`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []userRateRow{}
	for rows.Next() {
		var r userRateRow
		if err := rows.Scan(&r.ID, &r.Username, &r.Division, &r.HourlyRate); err == nil {
			list = append(list, r)
		}
	}

	c.JSON(http.StatusOK, list)
}

// UpdateUserHourlyRate: TERPISAH dari UpdateUser/PUT /users/:id (admin,
// wajib role_id) -- supaya Finance/HR GA & Legal bisa kelola rate tanpa
// perlu akses admin penuh.
func UpdateUserHourlyRate(c *gin.Context) {
	if !requireDepartment(c, "Finance") && !requireDepartment(c, "HR GA & Legal") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance/HR GA & Legal yang bisa mengubah rate tenaga kerja"})
		return
	}

	userID := c.Param("id")
	var body struct {
		HourlyRate float64 `json:"hourly_rate"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.HourlyRate < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hourly_rate wajib diisi dan tidak boleh negatif"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `UPDATE users SET hourly_rate = $1 WHERE id = $2`, body.HourlyRate, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "user_hourly_rate", userID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
