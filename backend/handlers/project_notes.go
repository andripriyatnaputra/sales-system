package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListProjectNotes: read terbuka, sama pola ListWorkRequestUpdates.
func ListProjectNotes(c *gin.Context) {
	projectID := c.Param("id")

	rows, err := database.Pool.Query(c, `
		SELECT pn.id, pn.project_id, pn.author_id, COALESCE(u.username, ''), pn.note, pn.created_at
		FROM project_notes pn
		LEFT JOIN users u ON u.id = pn.author_id
		WHERE pn.project_id = $1
		ORDER BY pn.created_at DESC
	`, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.ProjectNote{}
	for rows.Next() {
		var n models.ProjectNote
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.AuthorID, &n.AuthorUsername, &n.Note, &n.CreatedAt); err == nil {
			list = append(list, n)
		}
	}

	c.JSON(http.StatusOK, list)
}

// CreateProjectNote: gate canManageProjectCore -- Sales/admin, sama seperti
// UpdateProject (Sales adalah pemilik proses New Project/Quotation/Closing).
func CreateProjectNote(c *gin.Context) {
	projectID := c.Param("id")

	if !canManageProjectCore(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Sales yang bisa menambah catatan project"})
		return
	}

	var body struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Note) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note wajib diisi"})
		return
	}

	var noteID int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO project_notes (project_id, author_id, note)
		VALUES ($1, $2, $3)
		RETURNING id
	`, projectID, c.GetInt64("user_id"), strings.TrimSpace(body.Note)).Scan(&noteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "project_note", strconv.FormatInt(noteID, 10), "", gin.H{
		"project_id": projectID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": noteID})
}

// DeleteProjectNote: penulis sendiri atau system_admin -- pola sama persis
// DeleteWorkRequestUpdate (siapa yang menulis entri spesifik itu, bukan
// siapa pemilik project).
func DeleteProjectNote(c *gin.Context) {
	projectID := c.Param("id")
	noteID := c.Param("noteId")

	var authorID int64
	err := database.Pool.QueryRow(c, `
		SELECT author_id FROM project_notes WHERE id = $1 AND project_id = $2
	`, noteID, projectID).Scan(&authorID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "catatan tidak ditemukan"})
		return
	}

	if authorID != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya yang menulis atau system admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM project_notes WHERE id = $1`, noteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "project_note", noteID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
