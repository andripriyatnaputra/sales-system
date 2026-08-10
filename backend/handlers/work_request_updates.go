package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListWorkRequestUpdates: read terbuka, sama pola ListWorkRequestAttachments.
func ListWorkRequestUpdates(c *gin.Context) {
	workRequestID := c.Param("id")

	rows, err := database.Pool.Query(c, `
		SELECT wu.id, wu.work_request_id, wu.author_id, COALESCE(u.username, ''), wu.note, wu.created_at
		FROM work_request_updates wu
		LEFT JOIN users u ON u.id = wu.author_id
		WHERE wu.work_request_id = $1
		ORDER BY wu.created_at DESC
	`, workRequestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.WorkRequestUpdate{}
	for rows.Next() {
		var u models.WorkRequestUpdate
		if err := rows.Scan(&u.ID, &u.WorkRequestID, &u.AuthorID, &u.AuthorUsername, &u.Note, &u.CreatedAt); err == nil {
			list = append(list, u)
		}
	}

	c.JSON(http.StatusOK, list)
}

// CreateWorkRequestUpdate: gate SAMA PERSIS UpdateWorkRequestStatus/upload
// attachment -- requester/admin (pemilik request) ATAU Product & Development
// (fulfiller).
func CreateWorkRequestUpdate(c *gin.Context) {
	workRequestID := c.Param("id")

	isOwner, err := requesterOrAdmin(c, workRequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !isOwner && !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa menulis update"})
		return
	}

	var body struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Note) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note wajib diisi"})
		return
	}

	var updateID int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO work_request_updates (work_request_id, author_id, note)
		VALUES ($1, $2, $3)
		RETURNING id
	`, workRequestID, c.GetInt64("user_id"), strings.TrimSpace(body.Note)).Scan(&updateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "work_request_update", strconv.FormatInt(updateID, 10), "", gin.H{
		"work_request_id": workRequestID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": updateID})
}

// DeleteWorkRequestUpdate: penulis sendiri atau system_admin -- BUKAN
// pemilik work request, pola sama persis DeleteWorkRequestAttachment (siapa
// yang menulis entri spesifik itu, bukan siapa owner parent entity).
func DeleteWorkRequestUpdate(c *gin.Context) {
	workRequestID := c.Param("id")
	updateID := c.Param("updateId")

	var authorID int64
	err := database.Pool.QueryRow(c, `
		SELECT author_id FROM work_request_updates WHERE id = $1 AND work_request_id = $2
	`, updateID, workRequestID).Scan(&authorID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "update tidak ditemukan"})
		return
	}

	if authorID != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya yang menulis atau system admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM work_request_updates WHERE id = $1`, updateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "work_request_update", updateID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
