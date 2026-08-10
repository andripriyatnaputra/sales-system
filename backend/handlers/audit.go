package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// LogAudit mencatat satu baris audit trail. Dipakai lintas modul (user, project,
// budget, dan modul berikutnya: approval, PR/PO, dst) lewat satu titik ini --
// jangan reimplementasi insert audit_logs di masing-masing handler.
//
// Best-effort: kalau audit log gagal ditulis, request pemanggil TETAP lanjut
// (cuma warning ke log server), supaya kegagalan audit trail tidak menjatuhkan
// operasi bisnis yang sebenarnya. Konsisten dengan pola loadRoleContext di auth.go.
func LogAudit(ctx context.Context, actorUserID int64, action, entityType, entityID, entityLabel string, changes interface{}) {
	var actorUsername string
	_ = database.Pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, actorUserID).Scan(&actorUsername)

	var changesJSON []byte
	if changes != nil {
		changesJSON, _ = json.Marshal(changes)
	}

	_, err := database.Pool.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, entity_label, changes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, actorUserID, actorUsername, action, entityType, entityID, entityLabel, changesJSON)
	if err != nil {
		fmt.Println("warning: failed to write audit log:", err)
	}
}

// ListAuditLogs: GET /api/audit-logs, filter opsional entity_type & entity_id.
func ListAuditLogs(c *gin.Context) {
	entityType := c.Query("entity_type")
	entityID := c.Query("entity_id")

	query := `
		SELECT id, actor_user_id, actor_username, action, entity_type, entity_id, entity_label, changes, created_at
		FROM audit_logs
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1
	if entityType != "" {
		query += " AND entity_type = $" + strconv.Itoa(argIdx)
		args = append(args, entityType)
		argIdx++
	}
	if entityID != "" {
		query += " AND entity_id = $" + strconv.Itoa(argIdx)
		args = append(args, entityID)
		argIdx++
	}
	query += " ORDER BY created_at DESC LIMIT 200"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	logs := []models.AuditLog{}
	for rows.Next() {
		var l models.AuditLog
		var changesRaw []byte
		if err := rows.Scan(&l.ID, &l.ActorUserID, &l.ActorUsername, &l.Action, &l.EntityType, &l.EntityID, &l.EntityLabel, &changesRaw, &l.CreatedAt); err == nil {
			if len(changesRaw) > 0 {
				s := string(changesRaw)
				l.Changes = &s
			}
			logs = append(logs, l)
		}
	}

	c.JSON(http.StatusOK, logs)
}
