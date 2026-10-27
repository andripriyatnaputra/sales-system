package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

type approvalMatrixInput struct {
	EntityType     string   `json:"entity_type"`
	DepartmentID   *int64   `json:"department_id"`
	MinAmount      float64  `json:"min_amount"`
	MaxAmount      *float64 `json:"max_amount"`
	StepOrder      int      `json:"step_order"`
	ApproverType   string   `json:"approver_type"`
	ApproverRoleID *int64   `json:"approver_role_id"`
}

func ListApprovalMatrices(c *gin.Context) {
	rows, err := database.Pool.Query(c, `
		SELECT am.id, am.entity_type, am.department_id, COALESCE(d.name, ''),
		       am.min_amount, am.max_amount, am.step_order, am.approver_type,
		       am.approver_role_id, COALESCE(r.label, ''), am.created_at, am.updated_at
		FROM approval_matrices am
		LEFT JOIN departments d ON d.id = am.department_id
		LEFT JOIN roles r ON r.id = am.approver_role_id
		ORDER BY am.entity_type, am.department_id NULLS FIRST, am.min_amount, am.step_order, am.id
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	result := make([]models.ApprovalMatrixRule, 0)
	for rows.Next() {
		var rule models.ApprovalMatrixRule
		if err := rows.Scan(
			&rule.ID, &rule.EntityType, &rule.DepartmentID, &rule.DepartmentName,
			&rule.MinAmount, &rule.MaxAmount, &rule.StepOrder, &rule.ApproverType,
			&rule.ApproverRoleID, &rule.ApproverRoleLabel, &rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "scan error"})
			return
		}
		result = append(result, rule)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func CreateApprovalMatrix(c *gin.Context) {
	var input approvalMatrixInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	input.EntityType = strings.TrimSpace(input.EntityType)
	if err := validateApprovalMatrixInput(c, input, nil); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ensureApprovalMatrixNoOverlap(c, input, nil); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO approval_matrices
		       (entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, input.EntityType, input.DepartmentID, input.MinAmount, input.MaxAmount, input.StepOrder, input.ApproverType, input.ApproverRoleID).Scan(&id)
	if err != nil {
		if isDuplicateKeyErr(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "matrix dengan konfigurasi yang sama sudah ada"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create approval matrix"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "approval_matrix", strconv.FormatInt(id, 10), input.EntityType, input)
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateApprovalMatrix(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var input approvalMatrixInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	input.EntityType = strings.TrimSpace(input.EntityType)
	if err := validateApprovalMatrixInput(c, input, &id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ensureApprovalMatrixNoOverlap(c, input, &id); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	result, err := database.Pool.Exec(c, `
		UPDATE approval_matrices
		SET entity_type = $1, department_id = $2, min_amount = $3, max_amount = $4,
		    step_order = $5, approver_type = $6, approver_role_id = $7, updated_at = NOW()
		WHERE id = $8
	`, input.EntityType, input.DepartmentID, input.MinAmount, input.MaxAmount, input.StepOrder, input.ApproverType, input.ApproverRoleID, id)
	if err != nil {
		if isDuplicateKeyErr(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "matrix dengan konfigurasi yang sama sudah ada"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update approval matrix"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "approval matrix not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "approval_matrix", strconv.FormatInt(id, 10), input.EntityType, input)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func DeleteApprovalMatrix(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var entityType string
	err = database.Pool.QueryRow(c, `SELECT entity_type FROM approval_matrices WHERE id = $1`, id).Scan(&entityType)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "approval matrix not found"})
		return
	}

	result, err := database.Pool.Exec(c, `DELETE FROM approval_matrices WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete approval matrix"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "approval matrix not found"})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "delete", "approval_matrix", strconv.FormatInt(id, 10), entityType, nil)
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func validateApprovalMatrixInput(c *gin.Context, input approvalMatrixInput, ignoredID *int64) error {
	input.EntityType = strings.TrimSpace(input.EntityType)
	if input.EntityType == "" {
		return fmt.Errorf("entity_type wajib diisi")
	}
	for _, ch := range input.EntityType {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') && ch != '_' {
			return fmt.Errorf("entity_type hanya boleh berisi huruf kecil, angka, dan underscore")
		}
	}
	if input.MinAmount < 0 {
		return fmt.Errorf("min_amount tidak boleh negatif")
	}
	if input.MaxAmount != nil && *input.MaxAmount < input.MinAmount {
		return fmt.Errorf("max_amount tidak boleh lebih kecil dari min_amount")
	}
	if input.StepOrder < 1 {
		return fmt.Errorf("step_order minimal 1")
	}
	if input.ApproverType != "role" && input.ApproverType != "requester_manager" {
		return fmt.Errorf("approver_type tidak valid")
	}
	if input.ApproverType == "requester_manager" && input.ApproverRoleID != nil {
		return fmt.Errorf("requester_manager tidak boleh memiliki approver_role_id")
	}
	if input.ApproverType == "role" && input.ApproverRoleID == nil {
		return fmt.Errorf("approver_role_id wajib diisi untuk approver_type role")
	}

	if input.DepartmentID != nil {
		var exists bool
		if err := database.Pool.QueryRow(c, `SELECT EXISTS (SELECT 1 FROM departments WHERE id = $1)`, *input.DepartmentID).Scan(&exists); err != nil {
			return fmt.Errorf("gagal memvalidasi department")
		}
		if !exists {
			return fmt.Errorf("department tidak ditemukan")
		}
	}
	if input.ApproverRoleID != nil {
		var level string
		if err := database.Pool.QueryRow(c, `SELECT level FROM roles WHERE id = $1`, *input.ApproverRoleID).Scan(&level); err != nil {
			return fmt.Errorf("approver role tidak ditemukan")
		}
		if level != "manager" && level != "gm" && level != "executive" {
			return fmt.Errorf("approver role harus level Manager, GM, atau Executive")
		}
	}
	return nil
}

func ensureApprovalMatrixNoOverlap(c *gin.Context, input approvalMatrixInput, ignoredID *int64) error {
	var overlap bool
	err := database.Pool.QueryRow(c, `
		SELECT EXISTS (
			SELECT 1
			FROM approval_matrices
			WHERE entity_type = $1
			  AND department_id IS NOT DISTINCT FROM $2
			  AND step_order = $3
			  AND ($5::numeric IS NULL OR min_amount <= $5::numeric)
			  AND (max_amount IS NULL OR $4::numeric <= max_amount)
			  AND ($6::bigint IS NULL OR id <> $6::bigint)
		)
	`, input.EntityType, input.DepartmentID, input.StepOrder, input.MinAmount, input.MaxAmount, ignoredID).Scan(&overlap)
	if err != nil {
		return fmt.Errorf("gagal memvalidasi rentang matrix")
	}
	if overlap {
		return fmt.Errorf("rentang nominal overlap dengan matrix lain pada step dan scope yang sama")
	}
	return nil
}
