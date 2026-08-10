package handlers

import (
	"net/http"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// canManageWorkRequest: gate SAMA PERSIS UpdateWorkRequestStatus/attachment/
// update -- reuse langsung, tidak ada gate baru. Dipakai semua mutasi task
// krn checklist SIFATNYA kolaboratif (bukan per-task authorship spt lampiran/
// catatan) -- requester ATAU ProDev boleh kelola SEMUA task di request itu.
func canManageWorkRequest(c *gin.Context, workRequestID string) (bool, error) {
	isOwner, err := requesterOrAdmin(c, workRequestID)
	if err != nil {
		return false, err
	}
	return isOwner || requireDepartment(c, "Product & Development"), nil
}

// ListWorkRequestTasks: read terbuka, sama pola ListWorkRequestAttachments/
// ListWorkRequestUpdates. Urut created_at ASC (checklist, bukan log).
func ListWorkRequestTasks(c *gin.Context) {
	workRequestID := c.Param("id")

	rows, err := database.Pool.Query(c, `
		SELECT wt.id, wt.work_request_id, wt.title, wt.is_done, wt.created_by, COALESCE(u.username, ''), wt.created_at, wt.completed_at
		FROM work_request_tasks wt
		LEFT JOIN users u ON u.id = wt.created_by
		WHERE wt.work_request_id = $1
		ORDER BY wt.created_at ASC
	`, workRequestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.WorkRequestTask{}
	for rows.Next() {
		var t models.WorkRequestTask
		if err := rows.Scan(&t.ID, &t.WorkRequestID, &t.Title, &t.IsDone, &t.CreatedBy, &t.CreatedByUsername, &t.CreatedAt, &t.CompletedAt); err == nil {
			list = append(list, t)
		}
	}

	c.JSON(http.StatusOK, list)
}

func CreateWorkRequestTask(c *gin.Context) {
	workRequestID := c.Param("id")

	ok, err := canManageWorkRequest(c, workRequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa menambah task"})
		return
	}

	var body struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title wajib diisi"})
		return
	}

	var id int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO work_request_tasks (work_request_id, title, created_by)
		VALUES ($1, $2, $3)
		RETURNING id
	`, workRequestID, strings.TrimSpace(body.Title), c.GetInt64("user_id")).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "work_request_task", "", body.Title, gin.H{
		"work_request_id": workRequestID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateWorkRequestTask(c *gin.Context) {
	workRequestID := c.Param("id")
	taskID := c.Param("taskId")

	ok, err := canManageWorkRequest(c, workRequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa mengubah task"})
		return
	}

	var body struct {
		Title  *string `json:"title"`
		IsDone *bool   `json:"is_done"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE work_request_tasks
		SET title = COALESCE($1, title),
		    is_done = COALESCE($2, is_done),
		    completed_at = CASE
		        WHEN $2::boolean IS NULL THEN completed_at
		        WHEN $2::boolean = true THEN NOW()
		        ELSE NULL
		    END
		WHERE id = $3 AND work_request_id = $4
	`, body.Title, body.IsDone, taskID, workRequestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "work_request_task", taskID, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func DeleteWorkRequestTask(c *gin.Context) {
	workRequestID := c.Param("id")
	taskID := c.Param("taskId")

	ok, err := canManageWorkRequest(c, workRequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa menghapus task"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM work_request_tasks WHERE id = $1 AND work_request_id = $2`, taskID, workRequestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "work_request_task", taskID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
