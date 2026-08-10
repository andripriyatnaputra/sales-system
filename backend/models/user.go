package models

import "time"

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`     // "admin" or "user" (legacy, dipertahankan untuk kompatibilitas)
	Division     string    `json:"division"` // NetCo, Oil Gas & Mining, IT Solutions (lini bisnis/vertikal proyek)
	RoleID       *int64    `json:"role_id,omitempty"`
	ManagerID    *int64    `json:"manager_id,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// computed, diisi lewat JOIN saat dibutuhkan (mis. daftar user dengan detail role)
	RoleKey        string `json:"role_key,omitempty"`
	RoleLabel      string `json:"role_label,omitempty"`
	RoleDepartment string `json:"role_department,omitempty"`
	RoleLevel      string `json:"role_level,omitempty"`
}
