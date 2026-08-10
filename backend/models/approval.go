package models

import "time"

type ApprovalRequest struct {
	ID           int64     `json:"id"`
	EntityType   string    `json:"entity_type"`
	EntityID     string    `json:"entity_id"`
	EntityLabel  *string   `json:"entity_label,omitempty"`
	Amount       *float64  `json:"amount,omitempty"`
	DepartmentID *int64    `json:"department_id,omitempty"`
	RequestedBy  int64     `json:"requested_by"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	Steps []ApprovalStep `json:"steps,omitempty"`
}

// ApprovalStep: approver BISA role tetap (ApproverRoleID, dipakai utk GM -- cuma
// 1 per departemen) ATAU orang spesifik (ApproverUserID, dipakai utk "manager
// langsung" -- dinamis, di-resolve dari manager_id requester saat submit).
// Kalau requester belum punya manager_id, step 'requester_manager' otomatis
// Status='skipped' (bukan pending selamanya) -- lihat ApproverSkippedReason.
type ApprovalStep struct {
	ID                   int64      `json:"id"`
	ApprovalRequestID    int64      `json:"approval_request_id"`
	StepOrder            int        `json:"step_order"`
	ApproverRoleID       *int64     `json:"approver_role_id,omitempty"`
	ApproverRoleLabel    string     `json:"approver_role_label,omitempty"`
	ApproverUserID       *int64     `json:"approver_user_id,omitempty"`
	ApproverUserUsername string     `json:"approver_user_username,omitempty"`
	Status               string     `json:"status"`
	ActedBy              *int64     `json:"acted_by,omitempty"`
	ActedByUsername      string     `json:"acted_by_username,omitempty"`
	ActedAt              *time.Time `json:"acted_at,omitempty"`
	Comment              *string    `json:"comment,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}

type ApprovalMatrixRule struct {
	ID             int64    `json:"id"`
	EntityType     string   `json:"entity_type"`
	DepartmentID   *int64   `json:"department_id,omitempty"`
	MinAmount      float64  `json:"min_amount"`
	MaxAmount      *float64 `json:"max_amount,omitempty"`
	StepOrder      int      `json:"step_order"`
	ApproverType   string   `json:"approver_type"` // 'role' | 'requester_manager'
	ApproverRoleID *int64   `json:"approver_role_id,omitempty"`
}
