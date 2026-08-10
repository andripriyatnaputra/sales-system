package models

import "time"

type Department struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	HasGM     bool      `json:"has_gm"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type OrgUnit struct {
	ID             int64     `json:"id"`
	DepartmentID   int64     `json:"department_id"`
	DepartmentName string    `json:"department_name,omitempty"`
	Key            string    `json:"key"`
	Name           string    `json:"name"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Role: staff/manager menempel ke OrgUnitID (sub-tim spesifik), gm menempel ke
// DepartmentID langsung, executive/system_admin tidak menempel ke unit mana pun
// (keduanya nil).
type Role struct {
	ID             int64     `json:"id"`
	Key            string    `json:"key"`
	Label          string    `json:"label"`
	OrgUnitID      *int64    `json:"org_unit_id,omitempty"`
	DepartmentID   *int64    `json:"department_id,omitempty"`
	DepartmentName string    `json:"department_name,omitempty"`
	Level          string    `json:"level"`
	LegacyRole     string    `json:"legacy_role"`
	Permissions    []string  `json:"permissions"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Permission struct {
	ID          int64     `json:"id"`
	Key         string    `json:"key"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}
