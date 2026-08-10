package handlers

import (
	"crypto/rand"
	"encoding/hex"
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

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

const maxDocumentSize = 10 << 20 // 10MB

var allowedDocumentExt = map[string]bool{
	".pdf": true, ".doc": true, ".docx": true,
	".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true,
	".jpg": true, ".jpeg": true, ".png": true,
}

func uploadBaseDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "./uploads"
	}
	return dir
}

// checkProjectDivisionAccess: pola ACL yang sama dengan endpoint project lain --
// role=="user" dikunci ke division project itu.
func checkProjectDivisionAccess(c *gin.Context, projectID string) (bool, error) {
	var division string
	err := database.Pool.QueryRow(c, `SELECT division FROM projects WHERE id = $1`, projectID).Scan(&division)
	if err != nil {
		return false, err
	}
	if isSalesDivisionLocked(c) {
		userDivision := NormalizeDivision(c.GetString("division"))
		if userDivision == "" || userDivision != NormalizeDivision(division) {
			return false, nil
		}
	}
	return true, nil
}

// documentCategoryDepartment: departemen yang berwenang upload per kategori
// dokumen -- RFQ/TOR/SPH/Kontrak/Lainnya lahir dari proses Sales, PO dari
// Procurement, BAST dari Operations. Pola sama presalesSectionDepartment
// (presales_documents.go). Dokumen tetap bisa DILIHAT/di-download semua
// departemen yang punya akses ke project itu (division-scoped, lihat
// ListProjectDocuments/DownloadProjectDocument) -- gate ini cuma soal upload.
var documentCategoryDepartment = map[string]string{
	"RFQ": "Sales", "TOR": "Sales", "SPH": "Sales", "Kontrak": "Sales",
	"PO": "Procurement", "BAST": "Operations", "Lainnya": "Sales",
}

func UploadProjectDocument(c *gin.Context) {
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

	category := c.PostForm("category")
	if category == "" {
		category = "Lainnya"
	}
	ownerDept, validCategory := documentCategoryDepartment[category]
	if !validCategory {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category"})
		return
	}
	if !requireDepartment(c, ownerDept) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: kategori " + category + " hanya bisa diupload oleh " + ownerDept})
		return
	}

	var expiryDate *time.Time
	if raw := c.PostForm("expiry_date"); raw != "" {
		parsed, err := time.Parse("2006-01-02", raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date invalid, format YYYY-MM-DD"})
			return
		}
		expiryDate = &parsed
	}

	notes := c.PostForm("notes")

	// supersedes_id: opsional -- dokumen ini menggantikan versi sebelumnya.
	// Cuma boleh menggantikan versi TERBARU (is_latest=true) di kategori yang
	// SAMA di project yang SAMA, supaya chain versi tetap linear (bukan
	// bercabang).
	var supersedesID *int64
	if raw := c.PostForm("supersedes_id"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id invalid"})
			return
		}
		var existingProjectID int64
		var existingCategory string
		var existingIsLatest bool
		err = database.Pool.QueryRow(c, `SELECT project_id, category, is_latest FROM project_documents WHERE id = $1`, parsed).
			Scan(&existingProjectID, &existingCategory, &existingIsLatest)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: dokumen tidak ditemukan"})
			return
		}
		if strconv.FormatInt(existingProjectID, 10) != projectID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: dokumen bukan milik project ini"})
			return
		}
		if existingCategory != category {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: kategori dokumen harus sama"})
			return
		}
		if !existingIsLatest {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: cuma bisa menggantikan versi terbaru"})
			return
		}
		supersedesID = &parsed
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

	destDir := filepath.Join(uploadBaseDir(), "projects", projectID)
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

	relativePath := filepath.Join("projects", projectID, storedName)
	fileSize := fileHeader.Size

	tx, err := database.Pool.Begin(c)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(c)

	var docID int64
	err = tx.QueryRow(c, `
		INSERT INTO project_documents (project_id, category, file_name, file_path, file_size, uploaded_by, notes, expiry_date, supersedes_id)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8, $9)
		RETURNING id
	`, projectID, category, fileHeader.Filename, relativePath, fileSize, c.GetInt64("user_id"), notes, expiryDate, supersedesID).Scan(&docID)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if supersedesID != nil {
		if _, err := tx.Exec(c, `UPDATE project_documents SET is_latest = false WHERE id = $1`, *supersedesID); err != nil {
			_ = os.Remove(destPath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit(c); err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "transaction commit error"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "upload", "project_document", strconv.FormatInt(docID, 10), fileHeader.Filename, gin.H{
		"category": category, "project_id": projectID, "supersedes_id": supersedesID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": docID, "file_name": fileHeader.Filename, "category": category})
}

func ListProjectDocuments(c *gin.Context) {
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
		SELECT pd.id, pd.project_id, pd.category, pd.file_name, pd.file_size, pd.uploaded_by, COALESCE(u.username, ''), pd.notes, pd.created_at,
		       pd.expiry_date,
		       CASE WHEN pd.expiry_date IS NOT NULL THEN (pd.expiry_date - CURRENT_DATE)::int ELSE NULL END AS days_until_expiry,
		       pd.supersedes_id, pd.is_latest
		FROM project_documents pd
		LEFT JOIN users u ON u.id = pd.uploaded_by
		WHERE pd.project_id = $1
		ORDER BY pd.created_at DESC
	`, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	docs := []models.ProjectDocument{}
	for rows.Next() {
		var d models.ProjectDocument
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Category, &d.FileName, &d.FileSize, &d.UploadedBy, &d.UploadedByName, &d.Notes, &d.CreatedAt,
			&d.ExpiryDate, &d.DaysUntilExpiry, &d.SupersedesID, &d.IsLatest); err == nil {
			docs = append(docs, d)
		}
	}

	c.JSON(http.StatusOK, docs)
}

// ListExpiringDocuments: dokumen lintas-project yang punya expiry_date,
// diurutkan yang paling dekat/sudah lewat dulu. Read terbuka, sama pola
// ListAllPaymentSchedules (AP Aging lintas-PO).
func ListExpiringDocuments(c *gin.Context) {
	rows, err := database.Pool.Query(c, `
		SELECT pd.id, pd.project_id, p.project_code, p.description, pd.category, pd.file_name,
		       pd.expiry_date, (pd.expiry_date - CURRENT_DATE)::int AS days_until_expiry
		FROM project_documents pd
		JOIN projects p ON p.id = pd.project_id
		WHERE pd.expiry_date IS NOT NULL
		ORDER BY pd.expiry_date ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	type expiringDocRow struct {
		ID              int64     `json:"id"`
		ProjectID       int64     `json:"project_id"`
		ProjectCode     string    `json:"project_code"`
		ProjectDesc     string    `json:"project_description"`
		Category        string    `json:"category"`
		FileName        string    `json:"file_name"`
		ExpiryDate      time.Time `json:"expiry_date"`
		DaysUntilExpiry int       `json:"days_until_expiry"`
	}

	list := []expiringDocRow{}
	for rows.Next() {
		var r expiringDocRow
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.ProjectCode, &r.ProjectDesc, &r.Category, &r.FileName,
			&r.ExpiryDate, &r.DaysUntilExpiry); err == nil {
			list = append(list, r)
		}
	}

	c.JSON(http.StatusOK, list)
}

func DownloadProjectDocument(c *gin.Context) {
	projectID := c.Param("id")
	docID := c.Param("docId")

	ok, err := checkProjectDivisionAccess(c, projectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: cannot access project in another division"})
		return
	}

	var fileName, filePath string
	err = database.Pool.QueryRow(c, `
		SELECT file_name, file_path FROM project_documents WHERE id = $1 AND project_id = $2
	`, docID, projectID).Scan(&fileName, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	fullPath := filepath.Join(uploadBaseDir(), filePath)
	c.FileAttachment(fullPath, fileName)
}

// DeleteProjectDocument: uploader sendiri atau system_admin.
func DeleteProjectDocument(c *gin.Context) {
	projectID := c.Param("id")
	docID := c.Param("docId")

	ok, err := checkProjectDivisionAccess(c, projectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: cannot access project in another division"})
		return
	}

	var uploadedBy int64
	var filePath string
	err = database.Pool.QueryRow(c, `
		SELECT uploaded_by, file_path FROM project_documents WHERE id = $1 AND project_id = $2
	`, docID, projectID).Scan(&uploadedBy, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	if uploadedBy != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya yang mengupload atau system admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM project_documents WHERE id = $1`, docID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = os.Remove(filepath.Join(uploadBaseDir(), filePath))

	LogAudit(c, c.GetInt64("user_id"), "delete", "project_document", docID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
