package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// ListWorkRequestAttachments: read terbuka, sama pola ListWorkRequests.
func ListWorkRequestAttachments(c *gin.Context) {
	workRequestID := c.Param("id")

	rows, err := database.Pool.Query(c, `
		SELECT wa.id, wa.work_request_id, wa.file_name, wa.file_size, wa.uploaded_by, COALESCE(u.username, ''), wa.created_at
		FROM work_request_attachments wa
		LEFT JOIN users u ON u.id = wa.uploaded_by
		WHERE wa.work_request_id = $1
		ORDER BY wa.created_at DESC
	`, workRequestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.WorkRequestAttachment{}
	for rows.Next() {
		var a models.WorkRequestAttachment
		if err := rows.Scan(&a.ID, &a.WorkRequestID, &a.FileName, &a.FileSize, &a.UploadedBy, &a.UploadedByUsername, &a.CreatedAt); err == nil {
			list = append(list, a)
		}
	}

	c.JSON(http.StatusOK, list)
}

// UploadWorkRequestAttachment: gate SAMA PERSIS UpdateWorkRequestStatus --
// requester/admin (pemilik request) ATAU Product & Development (fulfiller).
func UploadWorkRequestAttachment(c *gin.Context) {
	workRequestID := c.Param("id")

	isOwner, err := requesterOrAdmin(c, workRequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work request tidak ditemukan"})
		return
	}
	if !isOwner && !requireDepartment(c, "Product & Development") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Product & Development atau pemilik request yang bisa upload lampiran"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file wajib diisi"})
		return
	}
	if fileHeader.Size > maxDocumentSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ukuran file maksimal 10MB"})
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedDocumentExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tipe file tidak didukung (pdf/doc/docx/xls/xlsx/ppt/pptx/jpg/png)"})
		return
	}

	destDir := filepath.Join(uploadBaseDir(), "work-requests", workRequestID)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyiapkan folder upload"})
		return
	}

	storedName := fmt.Sprintf("%d_%s%s", time.Now().Unix(), randomHex(8), ext)
	destPath := filepath.Join(destDir, storedName)
	if err := c.SaveUploadedFile(fileHeader, destPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan file"})
		return
	}

	relativePath := filepath.Join("work-requests", workRequestID, storedName)
	fileSize := fileHeader.Size

	var attachmentID int64
	err = database.Pool.QueryRow(c, `
		INSERT INTO work_request_attachments (work_request_id, file_name, file_path, file_size, uploaded_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, workRequestID, fileHeader.Filename, relativePath, fileSize, c.GetInt64("user_id")).Scan(&attachmentID)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "upload", "work_request_attachment", strconv.FormatInt(attachmentID, 10), fileHeader.Filename, gin.H{
		"work_request_id": workRequestID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": attachmentID, "file_name": fileHeader.Filename})
}

func DownloadWorkRequestAttachment(c *gin.Context) {
	workRequestID := c.Param("id")
	attachmentID := c.Param("attachmentId")

	var fileName, filePath string
	err := database.Pool.QueryRow(c, `
		SELECT file_name, file_path FROM work_request_attachments WHERE id = $1 AND work_request_id = $2
	`, attachmentID, workRequestID).Scan(&fileName, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}

	fullPath := filepath.Join(uploadBaseDir(), filePath)
	c.FileAttachment(fullPath, fileName)
}

// DeleteWorkRequestAttachment: uploader sendiri atau system_admin -- BUKAN
// pemilik work request, pola sama persis DeleteProjectDocument (siapa yang
// upload file spesifik itu, bukan siapa owner parent entity).
func DeleteWorkRequestAttachment(c *gin.Context) {
	workRequestID := c.Param("id")
	attachmentID := c.Param("attachmentId")

	var uploadedBy int64
	var filePath string
	err := database.Pool.QueryRow(c, `
		SELECT uploaded_by, file_path FROM work_request_attachments WHERE id = $1 AND work_request_id = $2
	`, attachmentID, workRequestID).Scan(&uploadedBy, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}

	if uploadedBy != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya yang mengupload atau system admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM work_request_attachments WHERE id = $1`, attachmentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = os.Remove(filepath.Join(uploadBaseDir(), filePath))

	LogAudit(c, c.GetInt64("user_id"), "delete", "work_request_attachment", attachmentID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
