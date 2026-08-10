package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Division string `json:"division"`
}

func Login(c *gin.Context) {
	var req LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Println("JSON Bind Error:", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	fmt.Printf("REQ BODY: username=%q password=%q\n", req.Username, req.Password)

	ctx := c.Request.Context()

	var user models.User
	err := database.Pool.QueryRow(ctx,
		`SELECT id, username, password_hash, role, division
         FROM users
         WHERE username = $1`,
		req.Username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role, &user.Division)

	if err != nil {
		logFailedLogin(ctx, nil, req.Username, "user tidak ditemukan")
		c.JSON(401, gin.H{"error": "invalid username/password"})
		return
	}

	if !CheckPassword(req.Password, user.PasswordHash) {
		logFailedLogin(ctx, &user.ID, req.Username, "password salah")
		c.JSON(401, gin.H{"error": "invalid username/password"})
		return
	}

	user.Division = NormalizeDivision(user.Division)

	roleKey, department, level, orgUnit, permissions, err := loadRoleContext(ctx, user.ID)
	if err != nil {
		fmt.Println("warning: failed to load role context:", err)
	}

	claims := jwt.MapClaims{
		"user_id":     user.ID,
		"role":        user.Role,
		"division":    user.Division,
		"role_key":    roleKey,
		"department":  department,
		"level":       level,
		"org_unit":    orgUnit,
		"permissions": permissions,
		"exp":         time.Now().Add(24 * time.Hour).Unix(),
		"iat":         time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(JwtSecret)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to sign token"})
		return
	}

	c.JSON(200, gin.H{
		"token":       signed,
		"role":        user.Role,
		"division":    user.Division,
		"username":    user.Username,
		"role_key":    roleKey,
		"department":  department,
		"level":       level,
		"org_unit":    orgUnit,
		"permissions": permissions,
	})
}

// loadRoleContext mengambil role granular (department/level) + daftar permission
// milik user, dipakai untuk mengisi JWT claims tambahan. Additive terhadap
// claims lama (role/division) -- tidak menggantikannya.
// Kalau user belum punya role_id (belum dimigrasi), kembalikan nilai kosong
// dan permissions kosong, bukan error -- login tetap jalan seperti sebelumnya.
func loadRoleContext(ctx context.Context, userID int64) (roleKey, department, level, orgUnit string, permissions []string, err error) {
	var deptPtr, orgUnitPtr *string
	err = database.Pool.QueryRow(ctx, `
		SELECT r.key, COALESCE(d.name, ou_dept.name), r.level, ou.name
		FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN departments d ON d.id = r.department_id
		LEFT JOIN org_units ou ON ou.id = r.org_unit_id
		LEFT JOIN departments ou_dept ON ou_dept.id = ou.department_id
		WHERE u.id = $1
	`, userID).Scan(&roleKey, &deptPtr, &level, &orgUnitPtr)

	if err != nil {
		if err == pgx.ErrNoRows {
			return "", "", "", "", []string{}, nil
		}
		return "", "", "", "", []string{}, err
	}
	if deptPtr != nil {
		department = *deptPtr
	}
	if orgUnitPtr != nil {
		orgUnit = *orgUnitPtr
	}

	rows, err := database.Pool.Query(ctx, `
		SELECT p.key
		FROM role_permissions rp
		JOIN permissions p ON p.id = rp.permission_id
		JOIN users u ON u.role_id = rp.role_id
		WHERE u.id = $1
	`, userID)
	if err != nil {
		return roleKey, department, level, orgUnit, []string{}, err
	}
	defer rows.Close()

	permissions = []string{}
	for rows.Next() {
		var key string
		if scanErr := rows.Scan(&key); scanErr != nil {
			return roleKey, department, level, orgUnit, permissions, scanErr
		}
		permissions = append(permissions, key)
	}

	return roleKey, department, level, orgUnit, permissions, nil
}

// logFailedLogin: catat percobaan login gagal ke audit_logs -- BUKAN lewat
// LogAudit() biasa, karena LogAudit meresolve actor_username dari actor_user_id
// (query balik ke tabel users), sedangkan di sini justru username yang DICOBA
// yang perlu direkam apa adanya (termasuk kalau usernamenya sendiri tidak
// pernah ada) -- actor_user_id NULL kalau user tidak ditemukan.
// Best-effort sama seperti LogAudit, tidak menjatuhkan request login.
func logFailedLogin(ctx context.Context, userID *int64, attemptedUsername, reason string) {
	_, err := database.Pool.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_label)
		VALUES ($1, $2, 'login_failed', 'auth', $3)
	`, userID, attemptedUsername, reason)
	if err != nil {
		fmt.Println("warning: failed to write login-failure audit log:", err)
	}
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
