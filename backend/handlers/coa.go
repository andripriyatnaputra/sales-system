package handlers

import (
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

var validAccountTypes = map[string]bool{
	"Asset": true, "Liability": true, "Equity": true,
	"Revenue": true, "COGS": true, "Expense": true,
}

// normalBalanceFor: diturunkan dari account_type, TIDAK disimpan sebagai
// kolom -- Asset/COGS/Expense normalnya debit, Liability/Equity/Revenue
// normalnya credit.
func normalBalanceFor(accountType string) string {
	switch accountType {
	case "Asset", "COGS", "Expense":
		return "debit"
	default:
		return "credit"
	}
}

func scanChartOfAccount(row interface{ Scan(...interface{}) error }) (*models.ChartOfAccount, error) {
	var a models.ChartOfAccount
	var parentCode *string
	err := row.Scan(&a.ID, &a.AccountCode, &a.AccountName, &a.AccountType, &a.ParentID, &parentCode,
		&a.Status, &a.Description, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if parentCode != nil {
		a.ParentCode = *parentCode
	}
	a.NormalBalance = normalBalanceFor(a.AccountType)
	return &a, nil
}

const coaSelectBase = `
	SELECT coa.id, coa.account_code, coa.account_name, coa.account_type, coa.parent_id, parent.account_code,
	       coa.status, coa.description, coa.created_at, coa.updated_at
	FROM chart_of_accounts coa
	LEFT JOIN chart_of_accounts parent ON parent.id = coa.parent_id
`

// ListChartOfAccounts: read terbuka (semua user login) -- dibutuhkan modul
// lain nanti (GL, Langkah 2) buat pilih akun saat posting jurnal.
func ListChartOfAccounts(c *gin.Context) {
	query := coaSelectBase
	args := []interface{}{}
	conds := []string{}

	if t := c.Query("type"); t != "" {
		conds = append(conds, "coa.account_type = $"+strconv.Itoa(len(args)+1))
		args = append(args, t)
	}
	if s := c.Query("status"); s != "" {
		conds = append(conds, "coa.status = $"+strconv.Itoa(len(args)+1))
		args = append(args, s)
	}
	for i, cond := range conds {
		if i == 0 {
			query += " WHERE " + cond
		} else {
			query += " AND " + cond
		}
	}
	query += " ORDER BY coa.account_code"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.ChartOfAccount{}
	for rows.Next() {
		a, err := scanChartOfAccount(rows)
		if err == nil {
			list = append(list, *a)
		}
	}
	c.JSON(http.StatusOK, list)
}

// validateParent: parent_id (kalau diisi) WAJIB account_type sama dgn akun
// ini, dan WAJIB top-level (parent_id milik parent itu sendiri harus NULL)
// -- membatasi hierarki cuma 2 level secara struktural.
func validateParent(c *gin.Context, parentID *int64, accountType string, selfID int64) (bool, string) {
	if parentID == nil {
		return true, ""
	}
	if *parentID == selfID {
		return false, "parent_id tidak boleh menunjuk ke akun itu sendiri"
	}
	var parentType string
	var grandParentID *int64
	err := database.Pool.QueryRow(c, `SELECT account_type, parent_id FROM chart_of_accounts WHERE id = $1`, *parentID).
		Scan(&parentType, &grandParentID)
	if err != nil {
		return false, "parent_id tidak ditemukan"
	}
	if parentType != accountType {
		return false, "parent_id harus akun dgn account_type yang sama (" + accountType + ")"
	}
	if grandParentID != nil {
		return false, "parent_id harus akun top-level (hierarki dibatasi 2 level)"
	}
	return true, ""
}

func CreateAccount(c *gin.Context) {
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa membuat akun"})
		return
	}

	var body struct {
		AccountCode string  `json:"account_code"`
		AccountName string  `json:"account_name"`
		AccountType string  `json:"account_type"`
		ParentID    *int64  `json:"parent_id"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.AccountCode == "" || body.AccountName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_code dan account_name wajib diisi"})
		return
	}
	if !validAccountTypes[body.AccountType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_type tidak valid"})
		return
	}
	if ok, msg := validateParent(c, body.ParentID, body.AccountType, 0); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_id, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, body.AccountCode, body.AccountName, body.AccountType, body.ParentID, body.Description).Scan(&id)
	if err != nil {
		if isDuplicateKeyErr(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "account_code sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "chart_of_account", strconv.FormatInt(id, 10), body.AccountCode, body)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateAccount(c *gin.Context) {
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa mengubah akun"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var body struct {
		AccountName string  `json:"account_name"`
		AccountType string  `json:"account_type"`
		ParentID    *int64  `json:"parent_id"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.AccountName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_name wajib diisi"})
		return
	}
	if !validAccountTypes[body.AccountType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_type tidak valid"})
		return
	}
	if ok, msg := validateParent(c, body.ParentID, body.AccountType, id); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE chart_of_accounts
		SET account_name = $1, account_type = $2, parent_id = $3, description = $4, updated_at = NOW()
		WHERE id = $5
	`, body.AccountName, body.AccountType, body.ParentID, body.Description, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "akun tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "chart_of_account", strconv.FormatInt(id, 10), body.AccountName, body)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// DeleteAccount: SOFT delete (status='inactive') -- akun akan di-FK oleh
// journal_entry_lines begitu Langkah 2 (GL) dibangun, sama alasan vendors
// sudah soft-delete duluan. Blokir kalau masih ada child aktif.
func DeleteAccount(c *gin.Context) {
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa menghapus akun"})
		return
	}
	id := c.Param("id")

	var childCount int
	if err := database.Pool.QueryRow(c, `
		SELECT count(*) FROM chart_of_accounts WHERE parent_id = $1 AND status = 'active'
	`, id).Scan(&childCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if childCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "tidak bisa dihapus: masih ada " + strconv.Itoa(childCount) + " akun child yang aktif"})
		return
	}

	cmdTag, err := database.Pool.Exec(c, `
		UPDATE chart_of_accounts SET status = 'inactive', updated_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "akun tidak ditemukan"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "chart_of_account", id, "", nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
