package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// SubmitForApproval mencari approval_matrices yang cocok (entity_type + department_id
// + amount), lalu membuat approval_requests + approval_steps sesuai konfigurasi.
// Dipanggil langsung (bukan lewat HTTP) oleh handler modul lain (PR/PO/payment, dst)
// saat entity tersebut butuh approval sebelum diproses lebih lanjut.
//
// Kalau tidak ada matrix rule yang cocok untuk entity_type itu, approval request
// TETAP dibuat tapi langsung berstatus 'approved' tanpa steps -- artinya entity_type
// itu belum dikonfigurasi butuh approval, bukan dianggap error.
func SubmitForApproval(ctx context.Context, entityType, entityID string, entityLabel *string, amount *float64, departmentID *int64, requestedBy int64) (*models.ApprovalRequest, error) {
	amt := 0.0
	if amount != nil {
		amt = *amount
	}

	rules, err := findMatrixRules(ctx, entityType, departmentID, amt)
	if err != nil {
		return nil, err
	}

	status := "pending"
	if len(rules) == 0 {
		status = "approved"
	}

	var reqID int64
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO approval_requests (entity_type, entity_id, entity_label, amount, department_id, requested_by, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, entityType, entityID, entityLabel, amount, departmentID, requestedBy, status).Scan(&reqID)
	if err != nil {
		return nil, err
	}

	for _, r := range rules {
		if r.ApproverType == "requester_manager" {
			var managerID *int64
			_ = database.Pool.QueryRow(ctx, `SELECT manager_id FROM users WHERE id = $1`, requestedBy).Scan(&managerID)
			if managerID == nil {
				// requester belum punya manager_id -- skip step ini (bukan blok
				// selamanya). Begitu manager_id requester diisi, submission
				// BERIKUTNYA otomatis kena gate sesungguhnya.
				_, err = database.Pool.Exec(ctx, `
					INSERT INTO approval_steps (approval_request_id, step_order, status, comment)
					VALUES ($1, $2, 'skipped', 'auto-skip: requester belum punya manager_id')
				`, reqID, r.StepOrder)
			} else {
				var stepID int64
				err = database.Pool.QueryRow(ctx, `
					INSERT INTO approval_steps (approval_request_id, step_order, approver_user_id, status)
					VALUES ($1, $2, $3, 'pending')
					RETURNING id
				`, reqID, r.StepOrder, *managerID).Scan(&stepID)
				if err == nil {
					notifyApprovalStep(ctx, stepID, []int64{*managerID}, entityLabel)
				}
			}
		} else {
			var stepID int64
			err = database.Pool.QueryRow(ctx, `
				INSERT INTO approval_steps (approval_request_id, step_order, approver_role_id, status)
				VALUES ($1, $2, $3, 'pending')
				RETURNING id
			`, reqID, r.StepOrder, r.ApproverRoleID).Scan(&stepID)
			if err == nil {
				approverIDs, aerr := usersWithRole(ctx, *r.ApproverRoleID)
				if aerr == nil {
					notifyApprovalStep(ctx, stepID, approverIDs, entityLabel)
				}
			}
		}
		if err != nil {
			return nil, err
		}
	}

	// Kalau SEMUA step ternyata di-skip (mis. semua butuh requester_manager tapi
	// tidak ada yang punya manager_id), approval_request otomatis 'approved' --
	// konsisten dengan fallback "tidak ada rule = auto-approved".
	if status == "pending" {
		var pendingCount int
		_ = database.Pool.QueryRow(ctx, `SELECT count(*) FROM approval_steps WHERE approval_request_id = $1 AND status = 'pending'`, reqID).Scan(&pendingCount)
		if pendingCount == 0 {
			_, err = database.Pool.Exec(ctx, `UPDATE approval_requests SET status = 'approved', updated_at = NOW() WHERE id = $1`, reqID)
			if err != nil {
				return nil, err
			}
		}
	}

	return GetApprovalRequest(ctx, reqID)
}

// usersWithRole: semua user aktif dgn role_id tertentu -- dipakai
// notifyApprovalStep supaya SEMUA orang yang berwenang bertindak di step
// role-based (bukan cuma 1 orang) dapat notifikasi masing-masing.
func usersWithRole(ctx context.Context, roleID int64) ([]int64, error) {
	rows, err := database.Pool.Query(ctx, `SELECT id FROM users WHERE role_id = $1`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// notifyApprovalStep: insert notifikasi event-driven utk step approval baru
// (Fase 4 Langkah 4) -- best-effort, GAGAL insert TIDAK membatalkan
// submission approval (beda dgn GL auto-posting yang fail-loud, krn
// notifikasi bukan bagian invarian akuntansi).
func notifyApprovalStep(ctx context.Context, stepID int64, userIDs []int64, entityLabel *string) {
	label := "approval"
	if entityLabel != nil {
		label = *entityLabel
	}
	title := "Approval diperlukan: " + label
	for _, uid := range userIDs {
		_, _ = database.Pool.Exec(ctx, `
			INSERT INTO notifications (user_id, approval_step_id, type, title, link)
			VALUES ($1, $2, 'approval_pending', $3, '/approvals?mine=true')
		`, uid, stepID, title)
	}
}

// findMatrixRules: utamakan rule spesifik department_id kalau ada, fallback ke
// rule universal (department_id IS NULL) kalau tidak ada rule spesifik yang cocok.
func findMatrixRules(ctx context.Context, entityType string, departmentID *int64, amount float64) ([]models.ApprovalMatrixRule, error) {
	if departmentID != nil {
		rules, err := queryMatrixRules(ctx, entityType, departmentID, amount)
		if err != nil {
			return nil, err
		}
		if len(rules) > 0 {
			return rules, nil
		}
	}
	return queryMatrixRules(ctx, entityType, nil, amount)
}

func queryMatrixRules(ctx context.Context, entityType string, departmentID *int64, amount float64) ([]models.ApprovalMatrixRule, error) {
	var deptClause string
	args := []interface{}{entityType, amount}
	if departmentID != nil {
		deptClause = "department_id = $3"
		args = append(args, *departmentID)
	} else {
		deptClause = "department_id IS NULL"
	}

	rows, err := database.Pool.Query(ctx, `
		SELECT id, entity_type, department_id, min_amount, max_amount, step_order, approver_type, approver_role_id
		FROM approval_matrices
		WHERE entity_type = $1
		  AND min_amount <= $2
		  AND (max_amount IS NULL OR max_amount >= $2)
		  AND `+deptClause+`
		ORDER BY step_order
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rules := []models.ApprovalMatrixRule{}
	for rows.Next() {
		var r models.ApprovalMatrixRule
		if err := rows.Scan(&r.ID, &r.EntityType, &r.DepartmentID, &r.MinAmount, &r.MaxAmount, &r.StepOrder, &r.ApproverType, &r.ApproverRoleID); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, nil
}

// GetApprovalRequest mengambil satu approval request beserta seluruh steps-nya.
func GetApprovalRequest(ctx context.Context, id int64) (*models.ApprovalRequest, error) {
	var ar models.ApprovalRequest
	err := database.Pool.QueryRow(ctx, `
		SELECT id, entity_type, entity_id, entity_label, amount, department_id, requested_by, status, created_at, updated_at
		FROM approval_requests WHERE id = $1
	`, id).Scan(&ar.ID, &ar.EntityType, &ar.EntityID, &ar.EntityLabel, &ar.Amount, &ar.DepartmentID, &ar.RequestedBy, &ar.Status, &ar.CreatedAt, &ar.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := database.Pool.Query(ctx, `
		SELECT s.id, s.approval_request_id, s.step_order, s.approver_role_id, COALESCE(r.label, ''),
		       s.approver_user_id, COALESCE(mu.username, ''),
		       s.status, s.acted_by, COALESCE(u.username, ''), s.acted_at, s.comment, s.created_at
		FROM approval_steps s
		LEFT JOIN roles r ON r.id = s.approver_role_id
		LEFT JOIN users mu ON mu.id = s.approver_user_id
		LEFT JOIN users u ON u.id = s.acted_by
		WHERE s.approval_request_id = $1
		ORDER BY s.step_order
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var s models.ApprovalStep
		if err := rows.Scan(&s.ID, &s.ApprovalRequestID, &s.StepOrder, &s.ApproverRoleID, &s.ApproverRoleLabel,
			&s.ApproverUserID, &s.ApproverUserUsername,
			&s.Status, &s.ActedBy, &s.ActedByUsername, &s.ActedAt, &s.Comment, &s.CreatedAt); err != nil {
			return nil, err
		}
		ar.Steps = append(ar.Steps, s)
	}

	return &ar, nil
}

// ActOnNextStep memproses step 'pending' PALING AWAL (step_order terkecil) pada
// approval request. Sekuensial: step berikutnya tidak bisa diaksi sebelum step
// sebelumnya disetujui -- karena kita selalu ambil step pending PALING AWAL,
// step yang lebih belakangan otomatis tidak actionable sampai gilirannya.
func ActOnNextStep(ctx context.Context, approvalRequestID int64, actorUserID int64, decision string, comment *string) (*models.ApprovalRequest, error) {
	if decision != "approve" && decision != "reject" {
		return nil, errors.New("invalid decision")
	}

	ar, err := GetApprovalRequest(ctx, approvalRequestID)
	if err != nil {
		return nil, err
	}
	if ar.Status != "pending" {
		return nil, errors.New("approval request already finalized (status: " + ar.Status + ")")
	}

	var currentStep *models.ApprovalStep
	for i := range ar.Steps {
		if ar.Steps[i].Status == "pending" {
			currentStep = &ar.Steps[i]
			break
		}
	}
	if currentStep == nil {
		return nil, errors.New("no pending step to act on")
	}

	authorized := false
	if currentStep.ApproverUserID != nil {
		// step 'requester_manager' -- harus PERSIS orang itu (manager requester)
		authorized = *currentStep.ApproverUserID == actorUserID
	} else if currentStep.ApproverRoleID != nil {
		var actorRoleID *int64
		err = database.Pool.QueryRow(ctx, `SELECT role_id FROM users WHERE id = $1`, actorUserID).Scan(&actorRoleID)
		if err != nil {
			return nil, err
		}
		authorized = actorRoleID != nil && *actorRoleID == *currentStep.ApproverRoleID
	}
	if !authorized {
		who := currentStep.ApproverRoleLabel
		if currentStep.ApproverUserID != nil {
			who = "manager langsung pemohon (" + currentStep.ApproverUserUsername + ")"
		}
		return nil, errors.New("forbidden: Anda bukan approver untuk step ini (" + who + ")")
	}

	newStepStatus := "approved"
	if decision == "reject" {
		newStepStatus = "rejected"
	}

	_, err = database.Pool.Exec(ctx, `
		UPDATE approval_steps
		   SET status = $1, acted_by = $2, acted_at = NOW(), comment = $3
		 WHERE id = $4
	`, newStepStatus, actorUserID, comment, currentStep.ID)
	if err != nil {
		return nil, err
	}

	newRequestStatus := ar.Status
	if decision == "reject" {
		newRequestStatus = "rejected"
	} else {
		allApproved := true
		for _, s := range ar.Steps {
			if s.ID == currentStep.ID {
				continue
			}
			if s.Status == "pending" {
				allApproved = false
				break
			}
		}
		if allApproved {
			newRequestStatus = "approved"
		}
	}

	if newRequestStatus != ar.Status {
		_, err = database.Pool.Exec(ctx, `UPDATE approval_requests SET status = $1, updated_at = NOW() WHERE id = $2`, newRequestStatus, approvalRequestID)
		if err != nil {
			return nil, err
		}
	}

	entityLabel := ""
	if ar.EntityLabel != nil {
		entityLabel = *ar.EntityLabel
	}
	LogAudit(ctx, actorUserID, decision, "approval_request", strconv.FormatInt(approvalRequestID, 10), entityLabel, gin.H{
		"step_order": currentStep.StepOrder,
		"comment":    comment,
	})

	return GetApprovalRequest(ctx, approvalRequestID)
}

// ===== HTTP handlers =====

func ListApprovals(c *gin.Context) {
	status := c.Query("status")
	entityType := c.Query("entity_type")
	mine := c.Query("mine") == "true"

	userID := c.GetInt64("user_id")

	query := `
		SELECT DISTINCT ar.id, ar.entity_type, ar.entity_id, ar.entity_label, ar.amount,
		       ar.department_id, ar.requested_by, ar.status, ar.created_at, ar.updated_at
		FROM approval_requests ar
	`
	where := []string{}
	args := []interface{}{}
	argIdx := 1

	if mine {
		query += ` JOIN approval_steps s ON s.approval_request_id = ar.id
		           JOIN users u ON u.id = $` + strconv.Itoa(argIdx)
		args = append(args, userID)
		argIdx++
		where = append(where, "s.status = 'pending' AND (s.approver_role_id = u.role_id OR s.approver_user_id = u.id)")
	}
	if status != "" {
		where = append(where, "ar.status = $"+strconv.Itoa(argIdx))
		args = append(args, status)
		argIdx++
	}
	if entityType != "" {
		where = append(where, "ar.entity_type = $"+strconv.Itoa(argIdx))
		args = append(args, entityType)
		argIdx++
	}

	if len(where) > 0 {
		query += " WHERE "
		for i, w := range where {
			if i > 0 {
				query += " AND "
			}
			query += w
		}
	}
	query += " ORDER BY ar.created_at DESC LIMIT 200"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	requests := []models.ApprovalRequest{}
	for rows.Next() {
		var ar models.ApprovalRequest
		if err := rows.Scan(&ar.ID, &ar.EntityType, &ar.EntityID, &ar.EntityLabel, &ar.Amount,
			&ar.DepartmentID, &ar.RequestedBy, &ar.Status, &ar.CreatedAt, &ar.UpdatedAt); err == nil {
			requests = append(requests, ar)
		}
	}

	c.JSON(http.StatusOK, requests)
}

func GetApproval(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid id"})
		return
	}

	ar, err := GetApprovalRequest(c, id)
	if err != nil {
		c.JSON(404, gin.H{"error": "approval request not found"})
		return
	}

	c.JSON(200, ar)
}

func ActOnApproval(decision string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid id"})
			return
		}

		var req struct {
			Comment string `json:"comment"`
		}
		_ = c.ShouldBindJSON(&req)

		var commentPtr *string
		if req.Comment != "" {
			commentPtr = &req.Comment
		}

		ar, err := ActOnNextStep(c, id, c.GetInt64("user_id"), decision, commentPtr)
		if err != nil {
			c.JSON(403, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, ar)
	}
}
