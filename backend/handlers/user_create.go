package handlers

import (
	"sales-system-backend/database"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func CreateUser(c *gin.Context) {
	var req struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		RoleID    int64  `json:"role_id"`
		Division  string `json:"division"`
		ManagerID *int64 `json:"manager_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	if strings.TrimSpace(req.Username) == "" {
		c.JSON(400, gin.H{"error": "username is required"})
		return
	}
	if strings.TrimSpace(req.Password) == "" {
		c.JSON(400, gin.H{"error": "password is required"})
		return
	}
	if req.RoleID == 0 {
		c.JSON(400, gin.H{"error": "role_id is required"})
		return
	}

	legacyRole, defaultDivision, err := resolveRoleForUser(c, req.RoleID)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid role_id: " + err.Error()})
		return
	}

	division := strings.TrimSpace(req.Division)
	if division == "" {
		division = defaultDivision
	} else {
		division = NormalizeDivision(division)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to hash password"})
		return
	}

	var id int64
	err = database.Pool.QueryRow(
		c,
		`
		INSERT INTO users (username, password_hash, role, division, role_id, manager_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
		`,
		req.Username,
		string(hash),
		legacyRole,
		division,
		req.RoleID,
		req.ManagerID,
	).Scan(&id)

	if err != nil {
		if strings.Contains(err.Error(), "users_username_key") {
			c.JSON(409, gin.H{"error": "username already exists"})
			return
		}

		c.JSON(500, gin.H{"error": "failed to create user"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "user", strconv.FormatInt(id, 10), req.Username, gin.H{
		"role_id":  req.RoleID,
		"division": division,
	})

	c.JSON(201, gin.H{
		"id":       id,
		"username": req.Username,
		"role":     legacyRole,
		"division": division,
		"role_id":  req.RoleID,
	})
}

// resolveRoleForUser mengambil legacy_role (admin/user, buat kompatibilitas kolom
// users.role lama) dan default division (kolom legacy, vertikal proyek) dari role
// yang dipilih. Default division: nama org_unit kalau departemennya Sales (karena
// org_unit Sales = vertikal proyek), atau nama departemen untuk role lain
// (mengikuti pola yang sudah ada di data, mis. user admin/system pakai division="Admin").
func resolveRoleForUser(c *gin.Context, roleID int64) (legacyRole string, defaultDivision string, err error) {
	var orgUnitName, orgUnitDeptName *string
	var deptName *string

	err = database.Pool.QueryRow(c, `
		SELECT r.legacy_role,
		       ou.name AS org_unit_name,
		       ou_dept.name AS org_unit_department_name,
		       d.name AS gm_department_name
		FROM roles r
		LEFT JOIN org_units ou ON ou.id = r.org_unit_id
		LEFT JOIN departments ou_dept ON ou_dept.id = ou.department_id
		LEFT JOIN departments d ON d.id = r.department_id
		WHERE r.id = $1
	`, roleID).Scan(&legacyRole, &orgUnitName, &orgUnitDeptName, &deptName)

	if err != nil {
		return "", "", err
	}

	switch {
	case orgUnitName != nil && orgUnitDeptName != nil && *orgUnitDeptName == "Sales":
		defaultDivision = *orgUnitName
	case orgUnitDeptName != nil:
		defaultDivision = *orgUnitDeptName
	case deptName != nil:
		defaultDivision = *deptName
	default:
		defaultDivision = "Admin"
	}

	return legacyRole, defaultDivision, nil
}
