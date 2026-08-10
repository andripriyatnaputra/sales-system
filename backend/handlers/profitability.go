package handlers

import (
	"net/http"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

// profitabilityBaseQuery: rumus rollup Target/Committed/Actual Paid/Revenue
// Realized/Additional Costs, SATU tempat dipakai 2 endpoint (per-project &
// lintas-project) supaya tidak disalin. JOIN sales_orders (inner) otomatis
// membatasi ke project yang sudah Win, sama pola dgn work_queue.go's
// postpo_incomplete. Committed cuma hitung PO status='approved' -- draft/
// rejected/cancelled bukan komitmen sungguhan.
func profitabilityBaseQuery(extraWhere string) string {
	return `
		SELECT p.id, p.project_code, p.description, COALESCE(cu.name,''),
		       COALESCE(rev.target, 0), COALESCE(po_sum.committed, 0),
		       COALESCE(paid_sum.actual_paid, 0), COALESCE(rev.realized, 0),
		       COALESCE(ac.additional_costs, 0), COALESCE(labor.labor_cost, 0)
		FROM projects p
		JOIN sales_orders so ON so.project_id = p.id
		LEFT JOIN customers cu ON cu.id = p.customer_id
		LEFT JOIN (
			SELECT project_id, SUM(target_revenue) AS target, SUM(target_realization) AS realized
			FROM project_revenue_plan GROUP BY project_id
		) rev ON rev.project_id = p.id
		LEFT JOIN (
			SELECT pr.sales_order_id, SUM(po.total_value) AS committed
			FROM purchase_orders po JOIN purchase_requests pr ON pr.id = po.purchase_request_id
			WHERE po.status = 'approved'
			GROUP BY pr.sales_order_id
		) po_sum ON po_sum.sales_order_id = so.id
		LEFT JOIN (
			SELECT pr.sales_order_id, SUM(ps.amount) AS actual_paid
			FROM payment_schedules ps
			JOIN purchase_orders po ON po.id = ps.parent_id AND ps.parent_type = 'vendor_po'
			JOIN purchase_requests pr ON pr.id = po.purchase_request_id
			WHERE ps.status = 'paid'
			GROUP BY pr.sales_order_id
		) paid_sum ON paid_sum.sales_order_id = so.id
		LEFT JOIN (
			SELECT project_id, SUM(amount) AS additional_costs
			FROM project_additional_costs GROUP BY project_id
		) ac ON ac.project_id = p.id
		LEFT JOIN (
			SELECT ts.project_id, SUM(ts.hours * COALESCE(u.hourly_rate,0)) AS labor_cost
			FROM timesheets ts JOIN users u ON u.id = ts.user_id
			GROUP BY ts.project_id
		) labor ON labor.project_id = p.id
	` + extraWhere
}

func scanProfitability(row interface{ Scan(...interface{}) error }) (*models.ProjectProfitability, error) {
	var pp models.ProjectProfitability
	err := row.Scan(&pp.ProjectID, &pp.ProjectCode, &pp.Description, &pp.CustomerName,
		&pp.Target, &pp.Committed, &pp.ActualPaid, &pp.RevenueRealized, &pp.AdditionalCosts, &pp.LaborCost)
	if err != nil {
		return nil, err
	}
	pp.RealMargin = pp.RevenueRealized - pp.ActualPaid - pp.AdditionalCosts - pp.LaborCost
	return &pp, nil
}

// GetProjectProfitability: rollup satu project. 404 kalau project belum
// punya sales_order (belum Win) -- JOIN sales_orders di query base tidak
// akan menghasilkan baris sama sekali dalam kasus itu.
func GetProjectProfitability(c *gin.Context) {
	id := c.Param("id")

	row := database.Pool.QueryRow(c, profitabilityBaseQuery("WHERE p.id = $1"), id)
	pp, err := scanProfitability(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project belum Win/belum ada Sales Order"})
		return
	}

	c.JSON(http.StatusOK, pp)
}

// ListProjectProfitability: rollup lintas-project, urut margin terkecil di
// atas (paling butuh perhatian dulu).
func ListProjectProfitability(c *gin.Context) {
	query := profitabilityBaseQuery("") + `
		ORDER BY (COALESCE(rev.realized,0) - COALESCE(paid_sum.actual_paid,0) - COALESCE(ac.additional_costs,0) - COALESCE(labor.labor_cost,0)) ASC
	`

	rows, err := database.Pool.Query(c, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.ProjectProfitability{}
	for rows.Next() {
		pp, err := scanProfitability(rows)
		if err == nil {
			list = append(list, *pp)
		}
	}

	c.JSON(http.StatusOK, list)
}
