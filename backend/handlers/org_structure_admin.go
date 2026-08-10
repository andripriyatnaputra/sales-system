package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// isDuplicateKeyErr: pgx mengembalikan pesan yang mengandung "duplicate key
// value violates unique constraint" untuk unique_violation -- dicek via
// substring, bukan pgconn.PgError, supaya tidak nambah import baru untuk
// satu pengecekan sederhana ini.
func isDuplicateKeyErr(err error) bool {
	return err != nil && strings.Contains(err.Error(), "duplicate key")
}

// ======================================================
// ORG UNITS (CRUD) -- departments SENGAJA TETAP READ-ONLY (ListDepartments di
// org_structure.go), karena nama departemen di-hardcode sebagai string literal
// di requireDepartment(c, "Operations") dst di banyak handler lain.
// ======================================================

func CreateOrgUnit(c *gin.Context) {
	var body struct {
		DepartmentID int64  `json:"department_id"`
		Key          string `json:"key"`
		Name         string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.DepartmentID == 0 || body.Key == "" || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id, key, dan name wajib diisi"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO org_units (department_id, key, name)
		VALUES ($1, $2, $3)
		RETURNING id
	`, body.DepartmentID, body.Key, body.Name).Scan(&id)
	if err != nil {
		if isDuplicateKeyErr(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "key sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "org_unit", strconv.FormatInt(id, 10), body.Name, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateOrgUnit: cuma `name` yang bisa diubah -- department_id (pindah
// departemen = restrukturisasi besar) dan key (dipakai unique constraint,
// referensi historis) sengaja tidak bisa diubah lewat endpoint ini.
func UpdateOrgUnit(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name wajib diisi"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE org_units SET name = $1, updated_at = NOW() WHERE id = $2
	`, body.Name, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "org_unit tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "org_unit", id, body.Name, body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteOrgUnit(c *gin.Context) {
	id := c.Param("id")

	var roleCount int
	if err := database.Pool.QueryRow(c, `SELECT count(*) FROM roles WHERE org_unit_id = $1`, id).Scan(&roleCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if roleCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "tidak bisa dihapus: masih ada " + strconv.Itoa(roleCount) + " role yang terikat ke org_unit ini"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `DELETE FROM org_units WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "org_unit tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "org_unit", id, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ======================================================
// PERMISSIONS (read-only, dipakai buat checkbox assignment di form Role)
// ======================================================

func ListPermissions(c *gin.Context) {
	rows, err := database.Pool.Query(c, `SELECT id, key, description, created_at FROM permissions ORDER BY id`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	perms := []models.Permission{}
	for rows.Next() {
		var p models.Permission
		if err := rows.Scan(&p.ID, &p.Key, &p.Description, &p.CreatedAt); err == nil {
			perms = append(perms, p)
		}
	}

	c.JSON(http.StatusOK, perms)
}

// ======================================================
// ROLES (CRUD)
// ======================================================

// validateRoleLevelLinks: mengikuti CHECK constraint yang sudah ada di skema
// roles -- staff/manager wajib org_unit_id (bukan department_id), gm wajib
// department_id (bukan org_unit_id), executive/system_admin tidak boleh
// keduanya. Divalidasi di sini dulu supaya dapat pesan 400 yang jelas,
// bukan raw constraint-violation dari Postgres.
func validateRoleLevelLinks(level string, orgUnitID, departmentID *int64) error {
	switch level {
	case "staff", "manager":
		if orgUnitID == nil {
			return errors.New("org_unit_id wajib diisi untuk level " + level)
		}
		if departmentID != nil {
			return errors.New("department_id harus kosong untuk level " + level)
		}
	case "gm":
		if departmentID == nil {
			return errors.New("department_id wajib diisi untuk level gm")
		}
		if orgUnitID != nil {
			return errors.New("org_unit_id harus kosong untuk level gm")
		}
	case "executive", "system_admin":
		if orgUnitID != nil || departmentID != nil {
			return errors.New("org_unit_id dan department_id harus kosong untuk level " + level)
		}
	default:
		return errors.New("level tidak valid")
	}
	return nil
}

type roleRequestBody struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Level        string   `json:"level"`
	OrgUnitID    *int64   `json:"org_unit_id"`
	DepartmentID *int64   `json:"department_id"`
	LegacyRole   string   `json:"legacy_role"`
	Permissions  []string `json:"permissions"`
}

// replaceRolePermissions: hapus semua role_permissions milik role ini, insert
// ulang yang dicentang -- dibungkus transaksi. Dipakai Create (no-op delete,
// role_id baru) dan Update (delete-then-insert sungguhan).
func replaceRolePermissions(c *gin.Context, roleID int64, permissionKeys []string) error {
	tx, err := database.Pool.Begin(c)
	if err != nil {
		return err
	}
	defer tx.Rollback(c)

	if _, err := tx.Exec(c, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return err
	}

	for _, key := range permissionKeys {
		_, err := tx.Exec(c, `
			INSERT INTO role_permissions (role_id, permission_id)
			SELECT $1, id FROM permissions WHERE key = $2
		`, roleID, key)
		if err != nil {
			return err
		}
	}

	return tx.Commit(c)
}

func CreateRole(c *gin.Context) {
	var body roleRequestBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Key == "" || body.Label == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key dan label wajib diisi"})
		return
	}
	if body.LegacyRole != "admin" && body.LegacyRole != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "legacy_role harus 'admin' atau 'user'"})
		return
	}
	if err := validateRoleLevelLinks(body.Level, body.OrgUnitID, body.DepartmentID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO roles (key, label, org_unit_id, department_id, level, legacy_role)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, body.Key, body.Label, body.OrgUnitID, body.DepartmentID, body.Level, body.LegacyRole).Scan(&id)
	if err != nil {
		if isDuplicateKeyErr(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "key sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := replaceRolePermissions(c, id, body.Permissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal simpan permissions: " + err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "role", strconv.FormatInt(id, 10), body.Label, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateRole: key TIDAK bisa diubah (unique constraint + referensi historis).
// org_unit_id & department_id di-SET EKSPLISIT (bukan COALESCE dgn nilai
// lama) -- kalau level berubah, kolom yang tidak relevan utk level baru HARUS
// jadi NULL, bukan tetap membawa nilai lama yang jadi stale.
func UpdateRole(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role id"})
		return
	}

	var body roleRequestBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Label == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "label wajib diisi"})
		return
	}
	if body.LegacyRole != "admin" && body.LegacyRole != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "legacy_role harus 'admin' atau 'user'"})
		return
	}
	if err := validateRoleLevelLinks(body.Level, body.OrgUnitID, body.DepartmentID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE roles
		SET label = $1, org_unit_id = $2, department_id = $3, level = $4, legacy_role = $5, updated_at = NOW()
		WHERE id = $6
	`, body.Label, body.OrgUnitID, body.DepartmentID, body.Level, body.LegacyRole, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "role tidak ditemukan"})
		return
	}

	if err := replaceRolePermissions(c, id, body.Permissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal simpan permissions: " + err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "role", idStr, body.Label, body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteRole(c *gin.Context) {
	id := c.Param("id")

	var userCount, matrixCount, stepCount int
	if err := database.Pool.QueryRow(c, `SELECT count(*) FROM users WHERE role_id = $1`, id).Scan(&userCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := database.Pool.QueryRow(c, `SELECT count(*) FROM approval_matrices WHERE approver_role_id = $1`, id).Scan(&matrixCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := database.Pool.QueryRow(c, `SELECT count(*) FROM approval_steps WHERE approver_role_id = $1`, id).Scan(&stepCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if userCount > 0 || matrixCount > 0 || stepCount > 0 {
		c.JSON(http.StatusConflict, gin.H{
			"error": "tidak bisa dihapus: masih dipakai " + strconv.Itoa(userCount) + " user, " +
				strconv.Itoa(matrixCount) + " approval matrix rule, " + strconv.Itoa(stepCount) + " riwayat approval step",
		})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `DELETE FROM roles WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "role tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "role", id, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
