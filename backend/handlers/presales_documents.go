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

// presalesSectionDepartment: section slug (dipakai di URL/form) -> nama
// departemen persis seperti dipakai requireDepartment() di presales.go --
// siapa boleh lampirkan dokumen ke bagian X harus sama dengan siapa boleh
// isi status/estimasi bagian X itu sendiri.
var presalesSectionDepartment = map[string]string{
	"prodev":      "Product & Development",
	"operations":  "Operations",
	"procurement": "Procurement",
	"finance":     "Finance",
}

// UploadPresalesDocument: cuma departemen pemilik bagian (atau admin) yang
// boleh lampirkan dokumen ke bagian itu -- beda dari UploadProjectDocument
// yang cuma dibatasi division, karena bagian presales sendiri memang
// dibatasi per departemen.
func UploadPresalesDocument(c *gin.Context) {
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

	section := c.PostForm("section")
	department, validSection := presalesSectionDepartment[section]
	if !validSection {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid section"})
		return
	}
	if !requireDepartment(c, department) {
		c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("forbidden: hanya %s yang bisa melampirkan dokumen ke bagian ini", department)})
		return
	}
	notes := c.PostForm("notes")

	// supersedes_id: opsional -- pola SAMA PERSIS UploadProjectDocument,
	// cross-check section (bukan category), cuma boleh menggantikan versi
	// TERBARU di section+project yang sama.
	var supersedesID *int64
	if raw := c.PostForm("supersedes_id"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id invalid"})
			return
		}
		var existingProjectID int64
		var existingSection string
		var existingIsLatest bool
		err = database.Pool.QueryRow(c, `SELECT project_id, section, is_latest FROM presales_documents WHERE id = $1`, parsed).
			Scan(&existingProjectID, &existingSection, &existingIsLatest)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: dokumen tidak ditemukan"})
			return
		}
		if strconv.FormatInt(existingProjectID, 10) != projectID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: dokumen bukan milik project ini"})
			return
		}
		if existingSection != section {
			c.JSON(http.StatusBadRequest, gin.H{"error": "supersedes_id: section dokumen harus sama"})
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

	destDir := filepath.Join(uploadBaseDir(), "projects", projectID, "presales", section)
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

	relativePath := filepath.Join("projects", projectID, "presales", section, storedName)
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
		INSERT INTO presales_documents (project_id, section, file_name, file_path, file_size, uploaded_by, notes, supersedes_id)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8)
		RETURNING id
	`, projectID, section, fileHeader.Filename, relativePath, fileSize, c.GetInt64("user_id"), notes, supersedesID).Scan(&docID)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if supersedesID != nil {
		if _, err := tx.Exec(c, `UPDATE presales_documents SET is_latest = false WHERE id = $1`, *supersedesID); err != nil {
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

	LogAudit(c, c.GetInt64("user_id"), "upload", "presales_document", strconv.FormatInt(docID, 10), fileHeader.Filename, gin.H{
		"section": section, "project_id": projectID, "supersedes_id": supersedesID,
	})

	c.JSON(http.StatusCreated, gin.H{"id": docID, "file_name": fileHeader.Filename, "section": section})
}

// ListPresalesDocuments: baca tidak digate departemen -- sama seperti
// GetPresalesAnalysis sendiri, siapa pun yang bisa lihat project ini bisa
// lihat semua lampiran di semua bagian. Return semua section sekaligus,
// frontend yang group per section.
func ListPresalesDocuments(c *gin.Context) {
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
		SELECT pd.id, pd.project_id, pd.section, pd.file_name, pd.file_size, pd.uploaded_by, COALESCE(u.username, ''), pd.notes, pd.created_at,
		       pd.supersedes_id, pd.is_latest
		FROM presales_documents pd
		LEFT JOIN users u ON u.id = pd.uploaded_by
		WHERE pd.project_id = $1
		ORDER BY pd.created_at DESC
	`, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	docs := []models.PresalesDocument{}
	for rows.Next() {
		var d models.PresalesDocument
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Section, &d.FileName, &d.FileSize, &d.UploadedBy, &d.UploadedByName, &d.Notes, &d.CreatedAt,
			&d.SupersedesID, &d.IsLatest); err == nil {
			docs = append(docs, d)
		}
	}

	c.JSON(http.StatusOK, docs)
}

func DownloadPresalesDocument(c *gin.Context) {
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
		SELECT file_name, file_path FROM presales_documents WHERE id = $1 AND project_id = $2
	`, docID, projectID).Scan(&fileName, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	fullPath := filepath.Join(uploadBaseDir(), filePath)
	c.FileAttachment(fullPath, fileName)
}

// DeletePresalesDocument: uploader sendiri atau system_admin -- tidak
// ditambah restriksi departemen ekstra, karena saat upload sudah dijamin
// cuma departemen pemilik/admin yang bisa membuat baris ini.
func DeletePresalesDocument(c *gin.Context) {
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
		SELECT uploaded_by, file_path FROM presales_documents WHERE id = $1 AND project_id = $2
	`, docID, projectID).Scan(&uploadedBy, &filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	if uploadedBy != c.GetInt64("user_id") && c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya yang mengupload atau system admin yang bisa menghapus"})
		return
	}

	_, err = database.Pool.Exec(c, `DELETE FROM presales_documents WHERE id = $1`, docID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = os.Remove(filepath.Join(uploadBaseDir(), filePath))

	LogAudit(c, c.GetInt64("user_id"), "delete", "presales_document", docID, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
