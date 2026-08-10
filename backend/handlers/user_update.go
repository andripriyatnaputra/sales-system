package handlers

import (
	"sales-system-backend/database"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func UpdateUser(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	var req struct {
		Username  string  `json:"username"`
		Password  *string `json:"password"`
		RoleID    int64   `json:"role_id"`
		Division  string  `json:"division"`
		ManagerID *int64  `json:"manager_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
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

	var passwordHash *string
	if req.Password != nil && *req.Password != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		h := string(hash)
		passwordHash = &h
	}

	// COALESCE(NULLIF($1,''), username) / manager_id: field yang tidak dikirim
	// (string kosong / nil) TIDAK menimpa nilai lama -- partial update, konsisten
	// dengan UpdateVendor/UpdateCustomer. Sebelumnya username selalu ditimpa
	// walau kosong (bug, ditemukan 2026-07-15 saat testing modul lain).
	if passwordHash != nil {
		_, err = database.Pool.Exec(c, `
			UPDATE users
			   SET username=COALESCE(NULLIF($1, ''), username), password_hash=$2, role=$3, division=$4,
			       role_id=$5, manager_id=COALESCE($6, manager_id), updated_at=NOW()
			 WHERE id=$7
		`, req.Username, *passwordHash, legacyRole, division, req.RoleID, req.ManagerID, id)
	} else {
		_, err = database.Pool.Exec(c, `
			UPDATE users
			   SET username=COALESCE(NULLIF($1, ''), username), role=$2, division=$3,
			       role_id=$4, manager_id=COALESCE($5, manager_id), updated_at=NOW()
			 WHERE id=$6
		`, req.Username, legacyRole, division, req.RoleID, req.ManagerID, id)
	}

	if err != nil {
		c.JSON(500, gin.H{"error": "update failed"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "user", strconv.FormatInt(id, 10), req.Username, gin.H{
		"role_id":          req.RoleID,
		"division":         division,
		"password_changed": passwordHash != nil,
	})

	c.JSON(200, gin.H{"status": "ok"})
}
