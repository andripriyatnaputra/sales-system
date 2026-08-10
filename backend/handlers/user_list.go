package handlers

import (
	"net/http"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func ListUsers(c *gin.Context) {
	rows, err := database.Pool.Query(c, `
		SELECT u.id, u.username, u.role, u.division, u.role_id, u.manager_id,
		       u.created_at, u.updated_at,
		       COALESCE(r.key, ''), COALESCE(r.label, ''),
		       COALESCE(d.name, ou_dept.name, ''), COALESCE(r.level, '')
		FROM users u
		LEFT JOIN roles r ON r.id = u.role_id
		LEFT JOIN departments d ON d.id = r.department_id
		LEFT JOIN org_units ou ON ou.id = r.org_unit_id
		LEFT JOIN departments ou_dept ON ou_dept.id = ou.department_id
		ORDER BY u.id
	`)
	if err != nil {
		c.JSON(500, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	users := []models.User{}

	for rows.Next() {
		var u models.User
		err := rows.Scan(
			&u.ID, &u.Username, &u.Role, &u.Division, &u.RoleID, &u.ManagerID,
			&u.CreatedAt, &u.UpdatedAt,
			&u.RoleKey, &u.RoleLabel, &u.RoleDepartment, &u.RoleLevel,
		)
		if err == nil {
			users = append(users, u)
		}
	}

	c.JSON(http.StatusOK, users)
}
