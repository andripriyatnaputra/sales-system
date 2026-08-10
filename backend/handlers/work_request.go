package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListWorkRequests: read terbuka (siapa pun login), pola sama customers/
// project_additional_costs. ?type=poc,demo (multi-value, IN filter) dipakai
// halaman POC/Demo; ?type=internal dipakai halaman Internal Dev Request.
// ?mine=true = creator-scoping (requested_by = user_id) -- BEDA dari
// approval.go's ?mine=true yang assignee-scoping, tapi nama query-param
// sama (konvensi boolean toggle yang sudah ada).
func ListWorkRequests(c *gin.Context) {
	query := `
		SELECT wr.id, wr.type, wr.title, wr.description, wr.customer_id, COALESCE(cu.name, ''),
		       wr.requesting_department_id, COALESCE(d.name, ''), wr.status, wr.target_date, wr.notes,
		       wr.requested_by, COALESCE(u.username, ''), wr.created_at, wr.updated_at,
		       (SELECT COUNT(*) FROM work_request_attachments wa WHERE wa.work_request_id = wr.id),
		       (SELECT COUNT(*) FROM work_request_updates wu WHERE wu.work_request_id = wr.id),
		       (SELECT COUNT(*) FROM work_request_tasks wt WHERE wt.work_request_id = wr.id),
		       (SELECT COUNT(*) FROM work_request_tasks wt WHERE wt.work_request_id = wr.id AND wt.is_done)
		FROM work_requests wr
		LEFT JOIN customers cu ON cu.id = wr.customer_id
		LEFT JOIN departments d ON d.id = wr.requesting_department_id
		LEFT JOIN users u ON u.id = wr.requested_by
		WHERE 1=1
	`
	args := []interface{}{}

	if typeParam := c.Query("type"); typeParam != "" {
		types := strings.Split(typeParam, ",")
		placeholders := make([]string, len(types))
		for i, t := range types {
			args = append(args, strings.TrimSpace(t))
			placeholders[i] = "$" + strconv.Itoa(len(args))
		}
		query += " AND wr.type IN (" + strings.Join(placeholders, ",") + ")"
	}
	if status := c.Query("status"); status != "" {
		args = append(args, status)
		query += " AND wr.status = $" + strconv.Itoa(len(args))
	}
	if c.Query("mine") == "true" {
		args = append(args, c.GetInt64("user_id"))
		query += " AND wr.requested_by = $" + strconv.Itoa(len(args))
	}
	query += " ORDER BY wr.created_at DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.WorkRequest{}
	for rows.Next() {
		var wr models.WorkRequest
		if err := rows.Scan(&wr.ID, &wr.Type, &wr.Title, &wr.Description, &wr.CustomerID, &wr.CustomerName,
			&wr.RequestingDepartmentID, &wr.RequestingDepartmentName, &wr.Status, &wr.TargetDate, &wr.Notes,
			&wr.RequestedBy, &wr.RequestedByUsername, &wr.CreatedAt, &wr.UpdatedAt, &wr.AttachmentCount, &wr.UpdateCount,
			&wr.TaskCount, &wr.TaskDoneCount); err == nil {
			list = append(list, wr)
		}
	}

	c.JSON(http.StatusOK, list)
}

// CreateWorkRequest: TIDAK digate department tertentu -- siapa pun boleh
// ajukan POC/Demo maupun Internal Dev Request. Validasi Go MIRROR CHECK
// constraint DB (work_requests_customer_check) supaya pesan error jelas
// sebelum query gagal.
func CreateWorkRequest(c *gin.Context) {
	var body struct {
		Type                   string `json:"type"`
		Title                  string `json:"title"`
		Description            string `json:"description"`
		CustomerID             *int64 `json:"customer_id"`
		RequestingDepartmentID *int64 `json:"requesting_department_id"`
		TargetDate             string `json:"target_date"`
		Notes                  string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title wajib diisi"})
		return
	}
	if body.Type != "poc" && body.Type != "demo" && body.Type != "internal" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type harus poc/demo/internal"})
		return
	}
	if (body.Type == "poc" || body.Type == "demo") && body.CustomerID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "customer_id wajib diisi untuk POC/Demo"})
		return
	}
	if body.Type == "internal" && body.RequestingDepartmentID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "requesting_department_id wajib diisi untuk Internal Dev Request"})
		return
	}
	// pastikan field yang TIDAK relevan buat type ini kosong (sama persis
	// CHECK constraint DB) -- kalau caller kirim keduanya, tolak sebelum
	// query, bukan pasrah ke DB error yang kurang jelas.
	if (body.Type == "poc" || body.Type == "demo") && body.RequestingDepartmentID != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "requesting_department_id tidak berlaku untuk POC/Demo"})
		return
	}
	if body.Type == "internal" && body.CustomerID != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "customer_id tidak berlaku untuk Internal Dev Request"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO work_requests (type, title, description, customer_id, requesting_department_id, target_date, notes, requested_by)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, NULLIF($6, '')::date, NULLIF($7, ''), $8)
		RETURNING id
	`, body.Type, body.Title, body.Description, body.CustomerID, body.RequestingDepartmentID, body.TargetDate, body.Notes, c.GetInt64("user_id")).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "work_request", strconv.FormatInt(id, 10), body.Title, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// requesterOrAdmin: pemilik request (requested_by) atau admin -- pola sama
// "uploader atau admin" di DeleteProjectDocument.
func requesterOrAdmin(c *gin.Context, requestID string) (bool, error) {
	if c.GetString("role") == "admin" {
		return true, nil
	}
	var requestedBy int64
	if err := database.Pool.QueryRow(c, `SELECT requested_by FROM work_requests WHERE id = $1`, requestID).Scan(&requestedBy); err != nil {
		return false, err
	}
	return requestedBy == c.GetInt64("user_id"), nil
}

func UpdateWorkRequest(c *gin.Context) {
	requestID := c.Param("id")

	ok, err := requesterOrAdmin(c, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya pemilik request atau admin yang bisa mengubah"})
		return
	}

	var body struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		TargetDate  *string `json:"target_date"`
		Notes       *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE work_requests
		SET title = COALESCE($1, title),
		    description = COALESCE($2, description),
		    target_date = COALESCE($3::date, target_date),
		    notes = COALESCE($4, notes),
		    updated_at = NOW()
		WHERE id = $5
	`, body.Title, body.Description, body.TargetDate, body.Notes, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "work_request", requestID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// UpdateWorkRequestStatus: gate Product & Development (fulfiller) ATAU
// pemilik request ATAU admin -- TIDAK membatasi status mana boleh diset per
// role (bukan matrix granular), proporsional utk tiket kerja ringan.
func UpdateWorkRequestStatus(c *gin.Context) {
	requestID := c.Param("id")

	isOwner, err := requesterOrAdmin(c, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !isOwner && !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa mengubah status"})
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != "open" && body.Status != "in_progress" && body.Status != "done" && body.Status != "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	_, err = database.Pool.Exec(c, `UPDATE work_requests SET status = $1, updated_at = NOW() WHERE id = $2`, body.Status, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update_status", "work_request", requestID, body.Status, body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteWorkRequest(c *gin.Context) {
	requestID := c.Param("id")

	ok, err := requesterOrAdmin(c, requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya pemilik request atau admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM work_requests WHERE id = $1`, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "work_request", requestID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
