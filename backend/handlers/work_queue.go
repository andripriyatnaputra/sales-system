package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// GetMyWorkQueue: "My Work" -- daftar item yang butuh aksi departemen user
// login, dipisah dari /approvals (yang cuma nampilin item yang SUDAH masuk
// approval engine). Ini nutupin gap SEBELUM approval: draft yang belum
// disubmit, item approved yang belum ditindaklanjuti ke tahap berikutnya,
// dan bagian presales yang belum diisi.
func GetMyWorkQueue(c *gin.Context) {
	department := c.GetString("department")
	orgUnit := c.GetString("org_unit")
	if c.GetString("role") == "admin" {
		if q := c.Query("department"); q != "" {
			department = q
		}
		if q := c.Query("org_unit"); q != "" {
			orgUnit = q
		}
	}

	ctx := c.Request.Context()
	var items []models.WorkQueueItem
	var err error

	switch department {
	case "Product & Development":
		items, err = prodevQueue(ctx, c.GetString("level"), orgUnit)
	case "Operations":
		items, err = operationsQueue(ctx, orgUnit)
	case "Procurement":
		items, err = procurementQueue(ctx)
	case "Finance":
		items, err = financeQueue(ctx)
	default:
		items = []models.WorkQueueItem{}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	byDivision := map[string]int{}
	for _, it := range items {
		if it.Division != "" {
			byDivision[it.Division]++
		}
	}

	c.JSON(http.StatusOK, gin.H{"department": department, "items": items, "by_division": byDivision})
}

// presalesPendingQuery: keempat bagian presales_analyses (boq_status,
// installation_cost_status, vendor_cost_status, pnl_status) punya bentuk
// query yang identik -- cuma kolom status yang beda. statusCol SELALU salah
// satu dari 4 konstanta tetap di bawah, tidak pernah input user, jadi aman
// di-string-format langsung ke SQL.
//
// sales_stage < 4 (belum Quotation): presales cuma relevan SEBELUM stage-gate
// CheckPresalesGateForQuotation. Tanpa filter ini, project lama yang sudah
// lewat stage itu sebelum fitur presales ada (dan tidak pernah dapat baris
// presales_analyses) ikut nongol terus sebagai "pending" -- ratusan project
// closing lama, bukan pekerjaan aktual yang perlu ditindaklanjuti.
func presalesPendingQuery(statusCol string) string {
	return fmt.Sprintf(`
		SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''), p.created_at, p.division
		FROM projects p
		LEFT JOIN presales_analyses pa ON pa.project_id = p.id
		LEFT JOIN customers cu ON cu.id = p.customer_id
		WHERE (pa.%s = 'pending' OR pa.id IS NULL)
		  AND p.pipeline_status <> 'Drop'
		  AND p.sales_stage < 4
		ORDER BY p.created_at DESC`, statusCol)
}

func scanPresalesPending(ctx context.Context, statusCol string, entityType string) ([]models.WorkQueueItem, error) {
	rows, err := database.Pool.Query(ctx, presalesPendingQuery(statusCol))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.WorkQueueItem{}
	for rows.Next() {
		var it models.WorkQueueItem
		var code, title, detail, division string
		var id int64
		var createdAt time.Time
		if err := rows.Scan(&id, &code, &title, &detail, &createdAt, &division); err != nil {
			continue
		}
		it.EntityType = entityType
		it.EntityID = id
		it.Code = code
		it.Title = title
		it.Detail = detail
		it.Link = fmt.Sprintf("/projects/%d", id)
		it.CreatedAt = createdAt
		it.Division = division
		items = append(items, it)
	}
	return items, nil
}

// prodevQueue: dua sumber item -- (1) "prodev_needs_assignment" khusus GM+
// (level gm/executive/system_admin), project yang dokumennya sudah ditandai
// lengkap Sales tapi belum di-assign ke sub-tim mana pun; (2) BoQ pending
// SAMA seperti dulu, TAPI sekarang informational-routing per sub-tim: GM
// lihat semua project yang SUDAH di-assign, staff/manager cuma lihat yang
// di-assign ke org_unit mereka sendiri (mirror showImpl/showMS di
// operationsQueue). Project yang BELUM di-assign TIDAK nongol di BoQ
// pending siapa pun -- TAPI UpdateProdevSection TETAP bisa dipanggil
// langsung (routing saja, bukan enforcement -- lihat plan Fase "Assignment
// Project ke Sub-Tim ProDev").
func prodevQueue(ctx context.Context, level, orgUnit string) ([]models.WorkQueueItem, error) {
	isGM := level == "gm" || level == "executive" || level == "system_admin"
	items := []models.WorkQueueItem{}

	if isGM {
		needsAssign, err := queryWorkQueue(ctx, `
			SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''), p.documents_complete_at, p.division
			FROM projects p
			LEFT JOIN customers cu ON cu.id = p.customer_id
			WHERE p.documents_complete_at IS NOT NULL
			  AND p.prodev_org_unit_id IS NULL
			  AND p.pipeline_status <> 'Drop'
			ORDER BY p.documents_complete_at ASC
		`, func(row workQueueRow) models.WorkQueueItem {
			return models.WorkQueueItem{
				EntityType: "prodev_needs_assignment",
				EntityID:   row.id,
				Code:       row.s1,
				Title:      row.s2,
				Detail:     row.s3,
				Link:       fmt.Sprintf("/projects/%d", row.id),
				CreatedAt:  row.createdAt,
			}
		})
		if err != nil {
			return nil, err
		}
		items = append(items, needsAssign...)
	}

	boqQuery := `
		SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''), p.created_at, p.division
		FROM projects p
		LEFT JOIN presales_analyses pa ON pa.project_id = p.id
		LEFT JOIN customers cu ON cu.id = p.customer_id
		JOIN org_units pou ON pou.id = p.prodev_org_unit_id
		WHERE (pa.boq_status = 'pending' OR pa.id IS NULL)
		  AND p.pipeline_status <> 'Drop'
		  AND p.sales_stage < 4
	`
	boqArgs := []interface{}{}
	if !isGM {
		boqQuery += " AND pou.name = $1"
		boqArgs = append(boqArgs, orgUnit)
	}
	boqQuery += " ORDER BY p.created_at DESC"

	boqPending, err := queryWorkQueue(ctx, boqQuery, func(row workQueueRow) models.WorkQueueItem {
		return models.WorkQueueItem{
			EntityType: "presales_boq_pending",
			EntityID:   row.id,
			Code:       row.s1,
			Title:      row.s2,
			Detail:     row.s3,
			Link:       fmt.Sprintf("/projects/%d", row.id),
			CreatedAt:  row.createdAt,
		}
	}, boqArgs...)
	if err != nil {
		return nil, err
	}
	items = append(items, boqPending...)

	return items, nil
}

// operationsQueue: Operations punya 2 sub-tim dengan tanggung jawab berbeda
// (Implementations = pra-handover, Managed Service = pasca-handover project
// Recurring, lihat maybeHandoverToManagedService di bast_customer.go).
// orgUnit kosong (GM/admin/legacy user tanpa org_unit) -- fail-open, lihat
// gabungan keduanya, sama pola dgn isSalesDivisionLocked/canManageProjectCore.
func operationsQueue(ctx context.Context, orgUnit string) ([]models.WorkQueueItem, error) {
	showImpl := orgUnit == "" || orgUnit == "Implementations"
	showMS := orgUnit == "" || orgUnit == "Managed Service"

	items := []models.WorkQueueItem{}

	if !showImpl {
		msItems, err := managedServiceQueue(ctx)
		if err != nil {
			return nil, err
		}
		return msItems, nil
	}

	presalesItems, err := scanPresalesPending(ctx, "installation_cost_status", "presales_installation_pending")
	if err != nil {
		return nil, err
	}
	items = append(items, presalesItems...)

	metaImplItems, err := metaNeedsSubmitQuery(ctx, "Implementations")
	if err != nil {
		return nil, err
	}
	items = append(items, metaImplItems...)

	soRows, err := queryWorkQueue(ctx, `
		SELECT so.id, so.so_number, COALESCE(cu.name,''), '', so.created_at, p.division
		FROM sales_orders so
		JOIN projects p ON p.id = so.project_id
		LEFT JOIN customers cu ON cu.id = so.customer_id
		WHERE so.status = 'active'
		  AND NOT EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.sales_order_id = so.id)
		ORDER BY so.created_at DESC
	`, func(row workQueueRow) models.WorkQueueItem {
		return models.WorkQueueItem{
			EntityType: "so_needs_pr",
			EntityID:   row.id,
			Code:       row.s1,
			Title:      "Sales Order " + row.s1,
			Detail:     row.s2,
			Link:       fmt.Sprintf("/sales-orders/%d", row.id),
			CreatedAt:  row.createdAt,
		}
	})
	if err != nil {
		return nil, err
	}
	items = append(items, soRows...)

	poRows, err := queryWorkQueue(ctx, `
		SELECT po.id, po.po_number, '', '', po.created_at, p.division
		FROM purchase_orders po
		JOIN purchase_requests pr ON pr.id = po.purchase_request_id
		JOIN sales_orders so ON so.id = pr.sales_order_id
		JOIN projects p ON p.id = so.project_id
		WHERE po.status = 'approved'
		  AND po.id NOT IN (SELECT purchase_order_id FROM bast_vendor)
		ORDER BY po.created_at DESC
	`, func(row workQueueRow) models.WorkQueueItem {
		return models.WorkQueueItem{
			EntityType: "po_needs_bast",
			EntityID:   row.id,
			Code:       row.s1,
			Title:      "Purchase Order " + row.s1,
			Link:       fmt.Sprintf("/purchase-orders/%d", row.id),
			CreatedAt:  row.createdAt,
		}
	})
	if err != nil {
		return nil, err
	}
	items = append(items, poRows...)

	// JOIN sales_orders (inner, bukan left) yang membatasi ini cuma ke Win
	// deal -- sales_stage>=6 sendiri juga match Loss/Drop, tapi cuma project
	// Win yang pernah dapat baris sales_orders (ensureSalesOrderForProject).
	// Detail digabung dgn progress post-PO -- format "Nama Tahap - Status (X/5)".
	// Nama tahap PERSIS sama 5 nama di frontend (lib/constants.ts's STAGES) --
	// sengaja diduplikasi ke sini (bukan cuma nomor "Stage N") supaya kartu My
	// Work langsung kelihatan tahap SEBENARNYA tanpa perlu hafal mapping nomor,
	// tanpa perlu buka detail project.
	postpoRows, err := queryWorkQueue(ctx, `
		SELECT p.id, p.project_code, p.description,
		       COALESCE(cu.name,'') || ' — ' ||
		       CASE
		         WHEN COALESCE(m.stage5_status,'Not Started') <> 'Not Started' THEN 'Invoice Submission - ' || m.stage5_status
		         WHEN COALESCE(m.stage4_status,'Not Started') <> 'Not Started' THEN 'Goods Receipt / Service Acceptance - ' || m.stage4_status
		         WHEN COALESCE(m.stage3_status,'Not Started') <> 'Not Started' THEN 'Implementation - ' || m.stage3_status
		         WHEN COALESCE(m.stage2_status,'Not Started') <> 'Not Started' THEN 'Procurement & Delivery Execution - ' || m.stage2_status
		         WHEN COALESCE(m.stage1_status,'Not Started') <> 'Not Started' THEN 'Order Confirmation & Planning - ' || m.stage1_status
		         ELSE 'Order Confirmation & Planning - Not Started'
		       END || ' (' ||
		       (CASE WHEN COALESCE(m.stage1_status,'Not Started')='Done' THEN 1 ELSE 0 END +
		        CASE WHEN COALESCE(m.stage2_status,'Not Started')='Done' THEN 1 ELSE 0 END +
		        CASE WHEN COALESCE(m.stage3_status,'Not Started')='Done' THEN 1 ELSE 0 END +
		        CASE WHEN COALESCE(m.stage4_status,'Not Started')='Done' THEN 1 ELSE 0 END +
		        CASE WHEN COALESCE(m.stage5_status,'Not Started')='Done' THEN 1 ELSE 0 END)::text
		       || '/5)',
		       p.created_at, p.division
		FROM projects p
		JOIN sales_orders so ON so.project_id = p.id
		LEFT JOIN project_postpo_monitoring m ON m.project_id = p.id
		LEFT JOIN customers cu ON cu.id = p.customer_id
		WHERE p.sales_stage >= 6
		  AND (m.project_id IS NULL
		       OR m.stage1_status <> 'Done' OR m.stage2_status <> 'Done'
		       OR m.stage3_status <> 'Done' OR m.stage4_status <> 'Done'
		       OR m.stage5_status <> 'Done')
		ORDER BY p.created_at DESC
	`, func(row workQueueRow) models.WorkQueueItem {
		return models.WorkQueueItem{
			EntityType: "postpo_incomplete",
			EntityID:   row.id,
			Code:       row.s1,
			Title:      row.s2,
			Detail:     row.s3,
			Link:       fmt.Sprintf("/projects/%d", row.id),
			CreatedAt:  row.createdAt,
		}
	})
	if err != nil {
		return nil, err
	}
	items = append(items, postpoRows...)

	if showMS {
		msItems, err := managedServiceQueue(ctx)
		if err != nil {
			return nil, err
		}
		items = append(items, msItems...)
	}

	return items, nil
}

// managedServiceQueue: project Recurring/New Recurring yang sudah di-handover
// dari Implementations (ops_team='Managed Service') -- portofolio project yang
// sekarang jadi tanggung jawab Managed Service. Informational (belum ada aksi
// spesifik utk "menyelesaikan" item ini -- METAnya sendiri belum dibangun),
// bukan berarti item tidak berguna: ini memberi visibilitas project mana saja
// yang baru masuk tanggung jawab mereka.
func managedServiceQueue(ctx context.Context) ([]models.WorkQueueItem, error) {
	items, err := queryWorkQueue(ctx, `
		SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''),
		       COALESCE(p.ops_handover_date, p.created_at), p.division
		FROM projects p
		LEFT JOIN customers cu ON cu.id = p.customer_id
		WHERE p.ops_team = 'Managed Service'
		ORDER BY COALESCE(p.ops_handover_date, p.created_at) DESC
	`, func(row workQueueRow) models.WorkQueueItem {
		return models.WorkQueueItem{
			EntityType: "handed_over_to_ms",
			EntityID:   row.id,
			Code:       row.s1,
			Title:      row.s2,
			Detail:     row.s3,
			Link:       fmt.Sprintf("/projects/%d", row.id),
			CreatedAt:  row.createdAt,
		}
	})
	if err != nil {
		return nil, err
	}

	// META untuk project Recurring justru pekerjaan Managed Service (persis
	// alasan ops_team dibangun) -- tanpa ini Managed Service tidak akan pernah
	// lihat META draft mereka sendiri.
	metaMSItems, err := metaNeedsSubmitQuery(ctx, "Managed Service")
	if err != nil {
		return nil, err
	}
	items = append(items, metaMSItems...)

	return items, nil
}

// metaNeedsSubmitQuery: META (billing_requests) berstatus draft milik project
// dengan ops_team tertentu -- dipanggil 2x dgn parameter beda (Implementations
// di showImpl, Managed Service di managedServiceQueue) supaya masing-masing
// sub-tim Operations lihat META draft yang jadi tanggung jawabnya sendiri.
func metaNeedsSubmitQuery(ctx context.Context, opsTeam string) ([]models.WorkQueueItem, error) {
	rows, err := database.Pool.Query(ctx, `
		SELECT br.id, br.meta_number, so.so_number, br.created_at, p.division
		FROM billing_requests br
		JOIN sales_orders so ON so.id = br.sales_order_id
		JOIN projects p ON p.id = so.project_id
		WHERE br.status = 'draft' AND p.ops_team = $1
		ORDER BY br.created_at DESC
	`, opsTeam)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.WorkQueueItem{}
	for rows.Next() {
		var id int64
		var metaNumber, soNumber, division string
		var createdAt time.Time
		if err := rows.Scan(&id, &metaNumber, &soNumber, &createdAt, &division); err != nil {
			continue
		}
		items = append(items, models.WorkQueueItem{
			EntityType: "meta_needs_submit",
			EntityID:   id,
			Code:       metaNumber,
			Title:      "META " + metaNumber,
			Detail:     soNumber,
			Link:       fmt.Sprintf("/billing-requests/%d", id),
			CreatedAt:  createdAt,
			Division:   division,
		})
	}
	return items, nil
}

func procurementQueue(ctx context.Context) ([]models.WorkQueueItem, error) {
	items, err := scanPresalesPending(ctx, "vendor_cost_status", "presales_vendorcost_pending")
	if err != nil {
		return nil, err
	}

	prRows, err := database.Pool.Query(ctx, `
		SELECT pr.id, pr.pr_number, pr.total_estimated_value, pr.created_at, p.division
		FROM purchase_requests pr
		JOIN sales_orders so ON so.id = pr.sales_order_id
		JOIN projects p ON p.id = so.project_id
		WHERE pr.status = 'approved'
		  AND pr.id NOT IN (SELECT purchase_request_id FROM purchase_orders)
		ORDER BY pr.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer prRows.Close()
	for prRows.Next() {
		var id int64
		var prNumber, division string
		var totalEstimated float64
		var createdAt time.Time
		if err := prRows.Scan(&id, &prNumber, &totalEstimated, &createdAt, &division); err != nil {
			continue
		}
		items = append(items, models.WorkQueueItem{
			EntityType: "pr_needs_po",
			EntityID:   id,
			Code:       prNumber,
			Title:      "Purchase Request " + prNumber,
			Detail:     formatRupiah(totalEstimated),
			Link:       fmt.Sprintf("/purchase-requests/%d", id),
			CreatedAt:  createdAt,
			Division:   division,
		})
	}

	return items, nil
}

func financeQueue(ctx context.Context) ([]models.WorkQueueItem, error) {
	items, err := scanPresalesPending(ctx, "pnl_status", "presales_price_pending")
	if err != nil {
		return nil, err
	}

	rows, err := database.Pool.Query(ctx, `
		SELECT ps.id, ps.parent_id, COALESCE(po.po_number,''), ps.sequence, ps.amount, ps.due_date, ps.created_at,
		       COALESCE(p.division, '')
		FROM payment_schedules ps
		LEFT JOIN purchase_orders po ON po.id = ps.parent_id
		LEFT JOIN purchase_requests pr ON pr.id = po.purchase_request_id
		LEFT JOIN sales_orders so ON so.id = pr.sales_order_id
		LEFT JOIN projects p ON p.id = so.project_id
		WHERE ps.status = 'due' AND ps.parent_type = 'vendor_po'
		ORDER BY ps.due_date NULLS LAST, ps.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, parentID int64
		var poNumber, division string
		var sequence int
		var amount float64
		var dueDate *time.Time
		var createdAt time.Time
		if err := rows.Scan(&id, &parentID, &poNumber, &sequence, &amount, &dueDate, &createdAt, &division); err != nil {
			continue
		}
		detail := formatRupiah(amount)
		if dueDate != nil {
			detail += " — jatuh tempo " + dueDate.Format("2006-01-02")
		}
		items = append(items, models.WorkQueueItem{
			EntityType: "payment_due",
			EntityID:   id,
			Code:       poNumber,
			Title:      fmt.Sprintf("Termin #%d — %s", sequence, poNumber),
			Detail:     detail,
			Link:       fmt.Sprintf("/purchase-orders/%d", parentID),
			CreatedAt:  createdAt,
			Division:   division,
		})
	}

	metaRows, err := database.Pool.Query(ctx, `
		SELECT br.id, br.meta_number, so.so_number, br.amount, br.created_at, p.division
		FROM billing_requests br
		JOIN sales_orders so ON so.id = br.sales_order_id
		JOIN projects p ON p.id = so.project_id
		WHERE br.status = 'approved'
		  AND br.id NOT IN (SELECT billing_request_id FROM invoices)
		ORDER BY br.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer metaRows.Close()
	for metaRows.Next() {
		var id int64
		var metaNumber, soNumber, division string
		var amount float64
		var createdAt time.Time
		if err := metaRows.Scan(&id, &metaNumber, &soNumber, &amount, &createdAt, &division); err != nil {
			continue
		}
		items = append(items, models.WorkQueueItem{
			EntityType: "meta_needs_invoice",
			EntityID:   id,
			Code:       metaNumber,
			Title:      "META " + metaNumber,
			Detail:     soNumber + " — " + formatRupiah(amount),
			Link:       fmt.Sprintf("/billing-requests/%d", id),
			CreatedAt:  createdAt,
			Division:   division,
		})
	}

	invRows, err := database.Pool.Query(ctx, `
		SELECT inv.id, inv.invoice_number, so.so_number, inv.due_date, inv.created_at, p.division
		FROM invoices inv
		JOIN sales_orders so ON so.id = inv.sales_order_id
		JOIN projects p ON p.id = so.project_id
		WHERE inv.status = 'sent' AND inv.due_date < NOW()
		ORDER BY inv.due_date ASC
	`)
	if err != nil {
		return nil, err
	}
	defer invRows.Close()
	for invRows.Next() {
		var id int64
		var invoiceNumber, soNumber, division string
		var dueDate time.Time
		var createdAt time.Time
		if err := invRows.Scan(&id, &invoiceNumber, &soNumber, &dueDate, &createdAt, &division); err != nil {
			continue
		}
		items = append(items, models.WorkQueueItem{
			EntityType: "invoice_overdue",
			EntityID:   id,
			Code:       invoiceNumber,
			Title:      "Invoice " + invoiceNumber,
			Detail:     soNumber + " — jatuh tempo " + dueDate.Format("2006-01-02"),
			Link:       fmt.Sprintf("/invoices/%d", id),
			CreatedAt:  createdAt,
			Division:   division,
		})
	}

	return items, nil
}

// workQueueRow: baris hasil query dengan bentuk TETAP (id, s1, s2, s3,
// created_at, division) -- setiap query yang dipakai lewat queryWorkQueue
// WAJIB SELECT persis 6 kolom itu (pakai ” sebagai placeholder buat slot
// yang tidak dipakai query tertentu), supaya satu Scan() bisa dipakai
// bareng-bareng tanpa boilerplate berulang per query.
type workQueueRow struct {
	id        int64
	s1        string
	s2        string
	s3        string
	createdAt time.Time
	division  string
}

func queryWorkQueue(ctx context.Context, query string, build func(workQueueRow) models.WorkQueueItem, args ...interface{}) ([]models.WorkQueueItem, error) {
	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.WorkQueueItem{}
	for rows.Next() {
		var row workQueueRow
		if err := rows.Scan(&row.id, &row.s1, &row.s2, &row.s3, &row.createdAt, &row.division); err != nil {
			continue
		}
		item := build(row)
		item.Division = row.division
		items = append(items, item)
	}
	return items, nil
}

// formatRupiah: helper lokal, cuma dipakai buat field Detail di work queue
// (mis. nilai PR/PO/termin) -- format singkat "Rp 1.234.567", bukan
// pengganti formatIDR di frontend yang dipakai buat tampilan angka lain.
func formatRupiah(amount float64) string {
	s := strconv.FormatFloat(amount, 'f', 0, 64)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	var out []byte
	for i, ch := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, ch)
	}
	result := "Rp " + string(out)
	if neg {
		result = "-" + result
	}
	return result
}
