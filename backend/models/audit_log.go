package models

import "time"

type AuditLog struct {
	ID            int64     `json:"id"`
	ActorUserID   *int64    `json:"actor_user_id,omitempty"`
	ActorUsername string    `json:"actor_username"`
	Action        string    `json:"action"`
	EntityType    string    `json:"entity_type"`
	EntityID      *string   `json:"entity_id,omitempty"`
	EntityLabel   *string   `json:"entity_label,omitempty"`
	Changes       *string   `json:"changes,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}
