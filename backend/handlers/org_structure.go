package handlers

import (
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func ListDepartments(c *gin.Context) {
	rows, err := database.Pool.Query(c, `
		SELECT id, key, name, has_gm, created_at, updated_at
		FROM departments
		ORDER BY id
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	departments := []models.Department{}
	for rows.Next() {
		var d models.Department
		if err := rows.Scan(&d.ID, &d.Key, &d.Name, &d.HasGM, &d.CreatedAt, &d.UpdatedAt); err == nil {
			departments = append(departments, d)
		}
	}

	c.JSON(http.StatusOK, departments)
}

func ListOrgUnits(c *gin.Context) {
	departmentID := c.Query("department_id")

	query := `
		SELECT ou.id, ou.department_id, d.name, ou.key, ou.name, ou.created_at, ou.updated_at
		FROM org_units ou
		JOIN departments d ON d.id = ou.department_id
	`
	args := []interface{}{}
	if departmentID != "" {
		query += " WHERE ou.department_id = $1"
		args = append(args, departmentID)
	}
	query += " ORDER BY ou.department_id, ou.id"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	orgUnits := []models.OrgUnit{}
	for rows.Next() {
		var ou models.OrgUnit
		if err := rows.Scan(&ou.ID, &ou.DepartmentID, &ou.DepartmentName, &ou.Key, &ou.Name, &ou.CreatedAt, &ou.UpdatedAt); err == nil {
			orgUnits = append(orgUnits, ou)
		}
	}

	c.JSON(http.StatusOK, orgUnits)
}

// ListRoles dipakai untuk dropdown pemilihan role saat create/update user.
// Filter opsional: org_unit_id (role staff/manager sub-tim tertentu),
// department_id (role gm departemen tertentu), level (staff/manager/gm/executive/system_admin).
func ListRoles(c *gin.Context) {
	orgUnitID := c.Query("org_unit_id")
	departmentID := c.Query("department_id")
	level := c.Query("level")

	query := `
		SELECT r.id, r.key, r.label, r.org_unit_id, r.department_id,
		       COALESCE(d.name, d2.name, '') AS department_name,
		       r.level, r.legacy_role,
		       COALESCE((
		           SELECT array_agg(p.key ORDER BY p.key)
		           FROM role_permissions rp
		           JOIN permissions p ON p.id = rp.permission_id
		           WHERE rp.role_id = r.id
		       ), '{}') AS permissions,
		       r.created_at, r.updated_at
		FROM roles r
		LEFT JOIN departments d ON d.id = r.department_id
		LEFT JOIN org_units ou ON ou.id = r.org_unit_id
		LEFT JOIN departments d2 ON d2.id = ou.department_id
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if orgUnitID != "" {
		query += " AND r.org_unit_id = $" + strconv.Itoa(argIdx)
		args = append(args, orgUnitID)
		argIdx++
	}
	if departmentID != "" {
		query += " AND (r.department_id = $" + strconv.Itoa(argIdx) + " OR ou.department_id = $" + strconv.Itoa(argIdx) + ")"
		args = append(args, departmentID)
		argIdx++
	}
	if level != "" {
		query += " AND r.level = $" + strconv.Itoa(argIdx)
		args = append(args, level)
		argIdx++
	}
	query += " ORDER BY r.id"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	roles := []models.Role{}
	for rows.Next() {
		var r models.Role
		if err := rows.Scan(&r.ID, &r.Key, &r.Label, &r.OrgUnitID, &r.DepartmentID, &r.DepartmentName, &r.Level, &r.LegacyRole, &r.Permissions, &r.CreatedAt, &r.UpdatedAt); err == nil {
			roles = append(roles, r)
		}
	}

	c.JSON(http.StatusOK, roles)
}
