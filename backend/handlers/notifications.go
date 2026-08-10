package handlers

import (
	"net/http"
	"strconv"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

type NotificationItem struct {
	ID        int64     `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Detail    string    `json:"detail,omitempty"`
	Link      string    `json:"link"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// ListNotifications: GET /notifications -- 2 bagian gabung 1 response
// (Fase 4 Langkah 4). "notifications" = event-driven persisted
// (approval_pending), difilter ke approval_step yang MASIH 'pending' --
// begitu diputuskan, notifikasi otomatis "hilang" dari feed (sama filosofi
// computed reminder, cuma read_at yang genuinely disimpan). "reminders" =
// REUSE LANGSUNG prodevQueue/operationsQueue/procurementQueue/financeQueue
// (work_queue.go, sama switch dispatch dgn GetMyWorkQueue) + subset dokumen
// mendekati expiry (threshold <=14 hari, query mirip ListExpiringDocuments
// tapi dipersempit) -- read-only, tidak punya status baca.
func ListNotifications(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()

	rows, err := database.Pool.Query(ctx, `
		SELECT n.id, n.type, n.title, n.detail, n.link, n.read_at, n.created_at
		FROM notifications n
		JOIN approval_steps s ON s.id = n.approval_step_id
		WHERE n.user_id = $1 AND s.status = 'pending'
		ORDER BY n.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	notifItems := []NotificationItem{}
	unreadCount := 0
	for rows.Next() {
		var it NotificationItem
		var detail *string
		var readAt *time.Time
		if err := rows.Scan(&it.ID, &it.Type, &it.Title, &detail, &it.Link, &readAt, &it.CreatedAt); err == nil {
			if detail != nil {
				it.Detail = *detail
			}
			it.IsRead = readAt != nil
			if !it.IsRead {
				unreadCount++
			}
			notifItems = append(notifItems, it)
		}
	}

	department := c.GetString("department")
	var reminders []models.WorkQueueItem
	switch department {
	case "Product & Development":
		reminders, _ = prodevQueue(ctx, c.GetString("level"), c.GetString("org_unit"))
	case "Operations":
		reminders, _ = operationsQueue(ctx, c.GetString("org_unit"))
	case "Procurement":
		reminders, _ = procurementQueue(ctx)
	case "Finance":
		reminders, _ = financeQueue(ctx)
	}
	if reminders == nil {
		reminders = []models.WorkQueueItem{}
	}

	docRows, err := database.Pool.Query(ctx, `
		SELECT pd.id, pd.file_name, (pd.expiry_date - CURRENT_DATE)::int AS days_until_expiry, pd.expiry_date
		FROM project_documents pd
		WHERE pd.expiry_date IS NOT NULL AND (pd.expiry_date - CURRENT_DATE)::int <= 14
		ORDER BY pd.expiry_date ASC
	`)
	if err == nil {
		defer docRows.Close()
		for docRows.Next() {
			var id int64
			var fileName string
			var days int
			var expiryDate time.Time
			if err := docRows.Scan(&id, &fileName, &days, &expiryDate); err == nil {
				detail := strconv.Itoa(days) + " hari lagi"
				if days < 0 {
					detail = "Expired " + strconv.Itoa(-days) + " hari lalu"
				}
				reminders = append(reminders, models.WorkQueueItem{
					EntityType: "document_expiring",
					EntityID:   id,
					Code:       fileName,
					Title:      fileName,
					Detail:     detail,
					Link:       "/document-expiry",
					CreatedAt:  expiryDate,
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifItems,
		"unread_count":  unreadCount,
		"reminders":     reminders,
	})
}

// MarkNotificationRead: PUT /notifications/:id/read.
func MarkNotificationRead(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetInt64("user_id")

	_, err := database.Pool.Exec(c, `
		UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL
	`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "read"})
}

// MarkAllNotificationsRead: POST /notifications/read-all.
func MarkAllNotificationsRead(c *gin.Context) {
	userID := c.GetInt64("user_id")

	_, err := database.Pool.Exec(c, `
		UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "read"})
}
