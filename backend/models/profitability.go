package models

// ProjectProfitability: rollup Target vs Committed vs Actual Paid vs Revenue
// Realized vs Real Margin (Fase 2 langkah 4). RealMargin DIHITUNG di Go
// (RevenueRealized - ActualPaid - AdditionalCosts), bukan disimpan.
// Target = project_revenue_plan.target_revenue (BUKAN presales_analyses.
// recommended_price atau BoQ proposed_sell_price -- tiga angka itu memang
// independen, ini reuse "Total Target" yang sudah jadi acuan utama di
// halaman detail project). Committed cuma hitung purchase_orders yang
// status='approved'.
type ProjectProfitability struct {
	ProjectID       int64   `json:"project_id"`
	ProjectCode     string  `json:"project_code"`
	Description     string  `json:"description"`
	CustomerName    string  `json:"customer_name"`
	Target          float64 `json:"target"`
	Committed       float64 `json:"committed"`
	ActualPaid      float64 `json:"actual_paid"`
	RevenueRealized float64 `json:"revenue_realized"`
	AdditionalCosts float64 `json:"additional_costs"`
	LaborCost       float64 `json:"labor_cost"`
	RealMargin      float64 `json:"real_margin"`
}
