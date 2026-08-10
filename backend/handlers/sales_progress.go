package handlers

import (
	"net/http"
	"strings"
	"time"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

// SalesProgressItem: satu baris "My Work" versi Sales -- BUKAN action item
// (Sales tidak mengisi bagian ProDev/Ops/Procurement/Finance), tapi status
// TERKINI request mereka sendiri sedang menunggu di mana. BottleneckLabel
// selalu SATU string (state paling awal yang belum selesai), BlockingDept
// kosong kalau state itu murni internal Sales (mis. masih Prospecting) atau
// project sudah selesai/closed.
type SalesProgressItem struct {
	ProjectID         int64  `json:"project_id"`
	ProjectCode       string `json:"project_code"`
	Description       string `json:"description"`
	CustomerName      string `json:"customer_name"`
	Division          string `json:"division"`
	SalesStage        int    `json:"sales_stage"`
	BottleneckLabel   string `json:"bottleneck_label"`
	BlockingDepartment string `json:"blocking_department,omitempty"`
	AgingDays         *int   `json:"aging_days,omitempty"`
}

type salesProgressRow struct {
	ProjectID      int64
	ProjectCode    string
	Description    string
	CustomerName   string
	Division       string
	SalesStage     int
	PipelineStatus string
	SPHStatus      *string
	CreatedAt      time.Time

	BOQStatus              *string
	InstallationCostStatus *string
	VendorCostStatus       *string
	PnLStatus              *string

	SOCreatedAt *time.Time

	PRStatus     *string
	PRCreatedAt  *time.Time
	PRApprovedAt *time.Time

	POStatus     *string
	POCreatedAt  *time.Time
	POApprovedAt *time.Time

	BVID        *int64
	BCID        *int64
	BCCreatedAt *time.Time

	BRStatus     *string
	BRCreatedAt  *time.Time
	BRApprovedAt *time.Time

	InvStatus    *string
	InvCreatedAt *time.Time
}

// GetSalesProgress: "My Work" versi Sales -- lihat request MEREKA SENDIRI
// (per project) sedang menunggu di departemen mana, bukan daftar aksi milik
// Sales sendiri (Sales tidak punya bagian di presales_analyses/PR/PO/BAST).
// Reuse pola scoping isSalesDivisionLocked yang sama dgn GetDashboard
// (dashboard.go:177-184).
func GetSalesProgress(c *gin.Context) {
	ctx := c.Request.Context()

	var division string
	var filterAll bool
	if isSalesDivisionLocked(c) {
		// User Sales biasa -- TIDAK BOLEH lihat divisi lain, query param
		// ?division= diabaikan sepenuhnya (fail-closed, sama pola GetDashboard).
		division = NormalizeDivision(c.GetString("division"))
		filterAll = false
	} else {
		raw := strings.TrimSpace(c.Query("division"))
		filterAll = raw == "" || strings.EqualFold(raw, "ALL")
		if !filterAll {
			division = NormalizeDivision(raw)
		}
	}

	query := `
		SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''), p.division, p.sales_stage,
		       p.pipeline_status, p.sph_status, p.created_at,
		       pa.boq_status, pa.installation_cost_status, pa.vendor_cost_status, pa.pnl_status,
		       so.created_at,
		       pr.status, pr.created_at, pr.approved_at,
		       po.status, po.created_at, po.approved_at,
		       bv.id, bc.id, bc.created_at,
		       br.status, br.created_at, br.approved_at,
		       inv.status, inv.created_at
		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN presales_analyses pa ON pa.project_id = p.id
		LEFT JOIN sales_orders so ON so.project_id = p.id
		LEFT JOIN LATERAL (
			SELECT pr2.id, pr2.status, pr2.created_at, pr2.approved_at
			FROM purchase_requests pr2 WHERE pr2.sales_order_id = so.id
			ORDER BY pr2.created_at DESC LIMIT 1
		) pr ON true
		LEFT JOIN LATERAL (
			SELECT po2.id, po2.status, po2.created_at, po2.approved_at
			FROM purchase_orders po2 WHERE po2.purchase_request_id = pr.id
			ORDER BY po2.created_at DESC LIMIT 1
		) po ON true
		LEFT JOIN LATERAL (
			SELECT bv2.id FROM bast_vendor bv2 WHERE bv2.purchase_order_id = po.id
			ORDER BY bv2.created_at DESC LIMIT 1
		) bv ON true
		LEFT JOIN LATERAL (
			SELECT bc2.id, bc2.created_at FROM bast_customer bc2 WHERE bc2.sales_order_id = so.id
			ORDER BY bc2.created_at DESC LIMIT 1
		) bc ON true
		LEFT JOIN LATERAL (
			SELECT br2.id, br2.status, br2.created_at, br2.approved_at
			FROM billing_requests br2 WHERE br2.sales_order_id = so.id
			ORDER BY br2.created_at DESC LIMIT 1
		) br ON true
		LEFT JOIN LATERAL (
			SELECT inv2.id, inv2.status, inv2.created_at
			FROM invoices inv2 WHERE inv2.billing_request_id = br.id
			ORDER BY inv2.created_at DESC LIMIT 1
		) inv ON true
		WHERE p.pipeline_status <> 'Drop'
	`
	args := []interface{}{}
	if !filterAll {
		query += " AND p.division = $1"
		args = append(args, division)
	}
	query += " ORDER BY p.created_at DESC"

	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	result := []SalesProgressItem{}
	for rows.Next() {
		var r salesProgressRow
		if err := rows.Scan(&r.ProjectID, &r.ProjectCode, &r.Description, &r.CustomerName, &r.Division, &r.SalesStage,
			&r.PipelineStatus, &r.SPHStatus, &r.CreatedAt,
			&r.BOQStatus, &r.InstallationCostStatus, &r.VendorCostStatus, &r.PnLStatus,
			&r.SOCreatedAt,
			&r.PRStatus, &r.PRCreatedAt, &r.PRApprovedAt,
			&r.POStatus, &r.POCreatedAt, &r.POApprovedAt,
			&r.BVID, &r.BCID, &r.BCCreatedAt,
			&r.BRStatus, &r.BRCreatedAt, &r.BRApprovedAt,
			&r.InvStatus, &r.InvCreatedAt); err != nil {
			continue
		}

		label, dept, ref := computeBottleneck(r)
		result = append(result, SalesProgressItem{
			ProjectID:          r.ProjectID,
			ProjectCode:        r.ProjectCode,
			Description:        r.Description,
			CustomerName:       r.CustomerName,
			Division:           r.Division,
			SalesStage:         r.SalesStage,
			BottleneckLabel:    label,
			BlockingDepartment: dept,
			AgingDays:          daysBetween(ref, nil),
		})
	}

	responseDivision := division
	if filterAll {
		responseDivision = "ALL"
	}
	c.JSON(http.StatusOK, gin.H{"division": responseDivision, "projects": result})
}

// computeBottleneck: state PALING AWAL yang belum selesai, urut sesuai alur
// bisnis riil (lihat plan "Aging per Kegiatan" utk rantai yang sama --
// approved_at PR/PO/META di sini adalah kolom yang sama ditambahkan fitur
// itu). Mengembalikan (label, departemen yang jadi bottleneck -- kosong
// kalau internal Sales atau sudah selesai, ref waktu utk hitung aging).
func computeBottleneck(r salesProgressRow) (string, string, *time.Time) {
	if r.PipelineStatus == "Hold" {
		return "On Hold", "", nil
	}

	switch {
	case r.SalesStage <= 2:
		if r.SalesStage == 1 {
			return "Prospecting", "", &r.CreatedAt
		}
		return "Qualification", "", &r.CreatedAt

	case r.SalesStage == 3:
		pending := []string{}
		if r.BOQStatus == nil || *r.BOQStatus == "pending" {
			pending = append(pending, "Product & Development")
		}
		if r.InstallationCostStatus == nil || *r.InstallationCostStatus == "pending" {
			pending = append(pending, "Operations")
		}
		if r.VendorCostStatus == nil || *r.VendorCostStatus == "pending" {
			pending = append(pending, "Procurement")
		}
		if r.PnLStatus == nil || *r.PnLStatus == "pending" {
			pending = append(pending, "Finance")
		}
		if len(pending) == 0 {
			return "Presales lengkap, menunggu approval harga", "", &r.CreatedAt
		}
		return "Menunggu: " + strings.Join(pending, ", "), strings.Join(pending, ", "), &r.CreatedAt

	case r.SalesStage >= 4 && r.SalesStage <= 5:
		if r.SalesStage == 4 {
			return "Quotation", "", &r.CreatedAt
		}
		return "Negotiation", "", &r.CreatedAt
	}

	// sales_stage >= 6
	if r.SPHStatus == nil || (*r.SPHStatus != "Win") {
		return "Closed (Loss/Drop)", "", nil
	}

	// Win -- rantai downstream.
	if r.SOCreatedAt == nil {
		return "SO belum terbentuk", "", nil
	}
	if r.PRStatus == nil {
		return "Menunggu Operations membuat Purchase Request", "Operations", r.SOCreatedAt
	}
	if *r.PRStatus != "approved" {
		return "PR menunggu approval", "", r.PRCreatedAt
	}
	if r.POStatus == nil {
		return "Menunggu Procurement membuat PO", "Procurement", r.PRApprovedAt
	}
	if *r.POStatus != "approved" {
		return "PO menunggu approval", "", r.POCreatedAt
	}
	if r.BVID == nil {
		return "Menunggu BAST Vendor dari Operations", "Operations", r.POApprovedAt
	}
	if r.BCID == nil {
		return "Menunggu BAST Customer / Instalasi", "Operations", r.SOCreatedAt
	}
	if r.BRStatus == nil {
		return "Menunggu Operations membuat META", "Operations", r.BCCreatedAt
	}
	if *r.BRStatus != "approved" {
		return "META menunggu approval", "", r.BRCreatedAt
	}
	if r.InvStatus == nil {
		return "Menunggu Finance membuat Invoice", "Finance", r.BRApprovedAt
	}
	switch *r.InvStatus {
	case "sent":
		return "Menunggu pembayaran customer", "", nil
	case "paid":
		return "Selesai", "", nil
	default:
		return "Invoice belum dikirim", "Finance", r.InvCreatedAt
	}
}
