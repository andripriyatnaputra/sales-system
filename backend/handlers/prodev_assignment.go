package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

// MarkProjectDocumentsComplete: Sales toggle "dokumen lengkap" -- pola sama
// canManageProjectCore (Sales/admin), TIDAK mensyaratkan jumlah dokumen
// minimum (percaya penilaian Sales, sama filosofi boq_status='submitted'
// yang juga tidak mensyaratkan isi BoQ tertentu). Ini trigger utk project
// muncul di antrian "perlu di-assign" GM Product & Development.
//
// Begitu ditandai lengkap, sales_stage ikut maju ke 3 (Presales Analysis) --
// momen ini SECARA PROSES BISNIS memang awal presales analysis dimulai
// (serah terima ke ProDev). `GREATEST(sales_stage, 3)` supaya SEARAH MAJU
// SAJA -- kalau project sudah lebih jauh (mis. Quotation/4), tidak boleh
// mundur. Uncheck (complete=false) SENGAJA TIDAK me-revert sales_stage --
// beda dari documents_complete_at yang murni penanda dokumen, sales_stage
// adalah progress pipeline yang tidak boleh hilang gara-gara Sales
// membatalkan centang dokumen.
func MarkProjectDocumentsComplete(c *gin.Context) {
	if !canManageProjectCore(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Sales yang bisa menandai dokumen project"})
		return
	}

	projectID := c.Param("id")
	var body struct {
		Complete bool `json:"complete"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	var err error
	if body.Complete {
		_, err = database.Pool.Exec(c, `
			UPDATE projects
			SET documents_complete_at = NOW(), sales_stage = GREATEST(sales_stage, 3)
			WHERE id = $1
		`, projectID)
	} else {
		_, err = database.Pool.Exec(c, `UPDATE projects SET documents_complete_at = NULL WHERE id = $1`, projectID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "project_documents_complete", projectID, "", body)

	if body.Complete {
		notifyProjectDocumentsCompleteEmail(c, projectID)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// AssignProdevTeam: GM Product & Development (atau executive/system_admin)
// assign project ke salah satu org_unit ProDev (Network Solutions/
// Development). Sifatnya ROUTING/VISIBILITY SAJA (lihat work_queue.go) --
// TIDAK mengunci UpdateProdevSection, siapa pun ProDev tetap bisa isi BoQ
// project mana pun seperti sebelumnya.
func AssignProdevTeam(c *gin.Context) {
	if !requireDepartment(c, "Product & Development") || !requireMinLevel(c, "gm") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya GM Product & Development yang bisa assign sub-tim"})
		return
	}

	projectID := c.Param("id")
	var body struct {
		OrgUnitID int64 `json:"org_unit_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.OrgUnitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_unit_id wajib diisi"})
		return
	}

	// Validasi org_unit_id BENAR milik department Product & Development --
	// cross-check di Go, pola sama validateParent() di coa.go.
	var deptName string
	err := database.Pool.QueryRow(c, `
		SELECT d.name FROM org_units ou JOIN departments d ON d.id = ou.department_id WHERE ou.id = $1
	`, body.OrgUnitID).Scan(&deptName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_unit_id tidak ditemukan"})
		return
	}
	if deptName != "Product & Development" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_unit_id bukan sub-tim Product & Development"})
		return
	}

	_, err = database.Pool.Exec(c, `
		UPDATE projects SET prodev_org_unit_id = $1, prodev_assigned_at = NOW() WHERE id = $2
	`, body.OrgUnitID, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "assign", "project_prodev_team", projectID, strconv.FormatInt(body.OrgUnitID, 10), body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// notifyProjectDocumentsCompleteEmail: kirim email ke Product & Development
// saat Sales menandai dokumen project lengkap -- ini titik "siap dikerjakan"
// ProDev, sebelum GM ProDev assign ke sub-tim (AssignProdevTeam). Badan email
// menyertakan catatan project TERBARU (project_notes, riwayat) supaya ProDev
// langsung dapat konteks tanpa buka aplikasi dulu. Best-effort penuh, pola
// sama notifyDepartmentByEmail di CreateWorkRequest -- gagal ambil data
// project/catatan TIDAK BOLEH menjatuhkan response utama yang sudah sukses.
func notifyProjectDocumentsCompleteEmail(c *gin.Context, projectID string) {
	var code, description string
	if err := database.Pool.QueryRow(c, `SELECT project_code, description FROM projects WHERE id = $1`, projectID).Scan(&code, &description); err != nil {
		return
	}

	note := "Belum ada catatan tambahan."
	var latestNote string
	if err := database.Pool.QueryRow(c, `SELECT note FROM project_notes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, projectID).Scan(&latestNote); err == nil {
		note = latestNote
	}

	notifyDepartmentByEmail(c.Request.Context(), "product_development",
		"Project siap dikerjakan: "+code,
		fmt.Sprintf("Project %s (%s) sudah ditandai dokumennya lengkap oleh Sales dan siap dikerjakan.\n\nCatatan: %s", code, description, note))
}
