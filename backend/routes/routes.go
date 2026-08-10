package routes

import (
	"sales-system-backend/handlers"
	"sales-system-backend/middleware"

	"github.com/gin-gonic/gin"
)

func Register(r *gin.Engine) {

	// ===============================
	// PUBLIC ROUTES (NO AUTH)
	// ===============================
	api := r.Group("/api")
	api.POST("/login", handlers.Login)

	// ===============================
	// PROTECTED ROUTES (JWT REQUIRED)
	// ===============================
	auth := api.Group("/")
	auth.Use(middleware.AuthRequired())

	// Example: return user info
	auth.GET("/me", handlers.Me)

	// ===============================
	// USER MANAGEMENT ROUTES (permission-gated, lihat middleware.RequirePermission)
	// ===============================
	auth.POST("/users", middleware.RequirePermission("users.manage"), handlers.CreateUser)
	auth.GET("/users", middleware.RequirePermission("users.manage"), handlers.ListUsers)
	auth.PUT("/users/:id", middleware.RequirePermission("users.manage"), handlers.UpdateUser)
	auth.DELETE("/users/:id", middleware.RequirePermission("users.manage"), handlers.DeleteUser)

	// ===============================
	// STRUKTUR ORGANISASI (referensi untuk dropdown CRUD user)
	// ===============================
	auth.GET("/departments", handlers.ListDepartments)
	auth.GET("/org-units", handlers.ListOrgUnits)
	auth.GET("/roles", handlers.ListRoles)
	auth.GET("/permissions", handlers.ListPermissions)

	// CRUD org_units & roles -- departments SENGAJA TETAP read-only (lihat
	// komentar di org_structure_admin.go)
	auth.POST("/org-units", middleware.RequirePermission("roles.manage"), handlers.CreateOrgUnit)
	auth.PUT("/org-units/:id", middleware.RequirePermission("roles.manage"), handlers.UpdateOrgUnit)
	auth.DELETE("/org-units/:id", middleware.RequirePermission("roles.manage"), handlers.DeleteOrgUnit)
	auth.POST("/roles", middleware.RequirePermission("roles.manage"), handlers.CreateRole)
	auth.PUT("/roles/:id", middleware.RequirePermission("roles.manage"), handlers.UpdateRole)
	auth.DELETE("/roles/:id", middleware.RequirePermission("roles.manage"), handlers.DeleteRole)

	// ===============================
	// AUDIT TRAIL
	// ===============================
	auth.GET("/audit-logs", middleware.RequirePermission("audit.view"), handlers.ListAuditLogs)

	// ===============================
	// APPROVAL ENGINE (generik, dipakai modul masa depan: PR/PO/payment/invoice)
	// ===============================
	auth.GET("/approvals", handlers.ListApprovals)
	auth.GET("/approvals/:id", handlers.GetApproval)
	auth.POST("/approvals/:id/approve", handlers.ActOnApproval("approve"))
	auth.POST("/approvals/:id/reject", handlers.ActOnApproval("reject"))

	// ===============================
	// NOTIFIKASI (Fase 4 Langkah 4 -- event-driven approval_pending +
	// reminder gabungan dari my-work-queue/document-expiry)
	// ===============================
	auth.GET("/notifications", handlers.ListNotifications)
	auth.PUT("/notifications/:id/read", handlers.MarkNotificationRead)
	auth.POST("/notifications/read-all", handlers.MarkAllNotificationsRead)

	// ===============================
	// MY WORK QUEUE (gap SEBELUM approval engine: draft belum disubmit,
	// item approved belum ditindaklanjuti, bagian presales belum diisi)
	// ===============================
	auth.GET("/my-work-queue", handlers.GetMyWorkQueue)
	auth.GET("/sales-progress", handlers.GetSalesProgress)

	// ===============================
	// PROJECT ROUTES
	// ===============================
	auth.POST("/projects", handlers.CreateProject)
	auth.GET("/projects", handlers.ListProjects)

	auth.GET("/projects/export/csv", handlers.ExportProjectsCSV)
	auth.GET("/projects/summary", handlers.GetProjectsSummary)

	auth.GET("/projects/pipeline/summary", handlers.GetProjectPipelineSummary)
	auth.GET("/projects/pipeline/details", handlers.GetProjectPipelineDetails)

	auth.GET("/projects/sph/summary", handlers.GetProjectSPHSummary)
	auth.GET("/projects/sph/details", handlers.GetProjectSPHDetails)

	auth.GET("/projects/:id/revenue-plan", handlers.GetRevenuePlan)
	auth.PUT("/projects/:id/realization/:month", handlers.UpdateRevenueRealization)
	auth.PUT("/projects/:id/postpo-monitoring", handlers.UpdatePostPOMonitoring)

	// Fase 2 langkah 3+4: additional costs + Project Profitability View
	auth.GET("/projects/:id/additional-costs", handlers.ListProjectAdditionalCosts)
	auth.POST("/projects/:id/additional-costs", handlers.CreateProjectAdditionalCost)
	auth.PUT("/projects/:id/additional-costs/:costId", handlers.UpdateProjectAdditionalCost)
	auth.DELETE("/projects/:id/additional-costs/:costId", handlers.DeleteProjectAdditionalCost)

	auth.GET("/projects/:id/profitability", handlers.GetProjectProfitability)
	auth.GET("/project-profitability", handlers.ListProjectProfitability)

	// ===============================
	// TIMESHEET & LABOR COSTING (Fase 5 area 1)
	// ===============================
	auth.GET("/projects/:id/timesheets", handlers.ListProjectTimesheets)
	auth.POST("/projects/:id/timesheets", handlers.CreateTimesheet)
	auth.PUT("/projects/:id/timesheets/:tsId", handlers.UpdateTimesheet)
	auth.DELETE("/projects/:id/timesheets/:tsId", handlers.DeleteTimesheet)
	auth.GET("/my-timesheets", handlers.ListMyTimesheets)
	auth.GET("/users/hourly-rates", handlers.ListUsersForRateManagement)
	auth.PUT("/users/:id/hourly-rate", handlers.UpdateUserHourlyRate)

	// ===============================
	// DASHBOARD EKSEKUTIF (Fase 5 area 2, level>=gm)
	// ===============================
	auth.GET("/executive-dashboard", handlers.GetExecutiveDashboard)

	auth.GET("/projects/pipeline", func(c *gin.Context) {
		c.JSON(400, gin.H{
			"error": "wrong endpoint called: use /projects/pipeline/summary or /projects/pipeline/details",
		})
	})

	auth.GET("/projects/sph", func(c *gin.Context) {
		c.JSON(400, gin.H{
			"error": "wrong endpoint called: use /projects/sph/summary or /projects/sph/details",
		})
	})

	auth.GET("/projects/:id", handlers.GetProject)
	auth.PUT("/projects/:id", handlers.UpdateProject)
	auth.DELETE("/projects/:id", handlers.DeleteProject)

	// ===============================
	// DOKUMEN PROJECT (RFQ/TOR/SPH/PO/Kontrak/BAST/dll -- menempel sepanjang siklus hidup project)
	// ===============================
	auth.GET("/projects/:id/documents", handlers.ListProjectDocuments)
	auth.POST("/projects/:id/documents", handlers.UploadProjectDocument)
	auth.GET("/projects/:id/documents/:docId/download", handlers.DownloadProjectDocument)
	auth.DELETE("/projects/:id/documents/:docId", handlers.DeleteProjectDocument)
	auth.GET("/document-expiry", handlers.ListExpiringDocuments)

	// ===============================
	// PRESALES ANALYSIS + BOQ (Fase 1 langkah 5, stage-gate sebelum Quotation)
	// ===============================
	auth.GET("/projects/:id/presales-analysis", handlers.GetPresalesAnalysis)
	auth.PUT("/projects/:id/presales-analysis/prodev", handlers.UpdateProdevSection)
	auth.PUT("/projects/:id/presales-analysis/operations", handlers.UpdateOperationsSection)
	auth.PUT("/projects/:id/presales-analysis/procurement", handlers.UpdateProcurementSection)
	auth.PUT("/projects/:id/presales-analysis/finance", handlers.UpdateFinanceSection)

	// Lampiran dokumen per bagian presales (business plan/P&L Finance, timeline
	// Operations, dst) -- digate per departemen (requireDepartment), beda dari
	// /documents di atas yang cuma digate division.
	auth.GET("/projects/:id/presales-documents", handlers.ListPresalesDocuments)
	auth.POST("/projects/:id/presales-documents", handlers.UploadPresalesDocument)
	auth.GET("/projects/:id/presales-documents/:docId/download", handlers.DownloadPresalesDocument)
	auth.DELETE("/projects/:id/presales-documents/:docId", handlers.DeletePresalesDocument)

	auth.GET("/projects/:id/boq-items", handlers.ListBOQItems)
	auth.POST("/projects/:id/boq-items", handlers.CreateBOQItem)
	auth.PUT("/projects/:id/boq-items/:itemId", handlers.UpdateBOQItem)
	auth.DELETE("/projects/:id/boq-items/:itemId", handlers.DeleteBOQItem)
	auth.GET("/projects/:id/boq-items/:itemId/history", handlers.ListBOQItemHistory)

	// Sales tandai dokumen project lengkap -> trigger GM Product & Development
	// assign project ke sub-tim (Network Solutions/Development). Routing/
	// visibility saja -- TIDAK mengunci UpdateProdevSection di atas.
	auth.PUT("/projects/:id/documents-complete", handlers.MarkProjectDocumentsComplete)
	auth.PUT("/projects/:id/prodev-assignment", handlers.AssignProdevTeam)

	// ===============================
	// SALES ORDER (Fase 1 langkah 6, otomatis dari Closing/Win -- tidak ada create manual)
	// ===============================
	auth.GET("/sales-orders", handlers.ListSalesOrders)
	auth.GET("/sales-orders/:id", handlers.GetSalesOrder)
	auth.PUT("/sales-orders/:id", middleware.RequirePermission("sales_orders.manage"), handlers.UpdateSalesOrder)
	auth.GET("/projects/:id/sales-order", handlers.GetSalesOrderByProject)

	// Customer PO bisa lebih dari satu per Sales Order (mis. Material vs Jasa/Instalasi)
	auth.POST("/sales-orders/:id/customer-pos", middleware.RequirePermission("sales_orders.manage"), handlers.CreateCustomerPO)
	auth.PUT("/sales-orders/:id/customer-pos/:poId", middleware.RequirePermission("sales_orders.manage"), handlers.UpdateCustomerPO)
	auth.DELETE("/sales-orders/:id/customer-pos/:poId", middleware.RequirePermission("sales_orders.manage"), handlers.DeleteCustomerPO)

	// ===============================
	// PURCHASE REQUEST (Ops) -> PURCHASE ORDER + payment_schedules (Procurement)
	// Fase 1 langkah 7. Otorisasi per-departemen (requireDepartment), bukan
	// permission generik -- sama pola dengan Presales Analysis langkah 5.
	// ===============================
	auth.GET("/purchase-requests", handlers.ListPurchaseRequests)
	auth.GET("/purchase-requests/:id", handlers.GetPurchaseRequest)
	auth.POST("/purchase-requests", handlers.CreatePurchaseRequest)
	auth.POST("/purchase-requests/:id/submit", handlers.SubmitPurchaseRequest)

	auth.GET("/purchase-orders", handlers.ListPurchaseOrders)
	auth.GET("/purchase-orders/:id", handlers.GetPurchaseOrder)
	auth.POST("/purchase-orders", handlers.CreatePurchaseOrder)
	auth.POST("/purchase-orders/:id/submit", handlers.SubmitPurchaseOrder)

	auth.POST("/purchase-orders/:id/payment-schedules", handlers.CreatePaymentSchedule)
	auth.PUT("/purchase-orders/:id/payment-schedules/:scheduleId", handlers.UpdatePaymentSchedule)
	auth.DELETE("/purchase-orders/:id/payment-schedules/:scheduleId", handlers.DeletePaymentSchedule)

	// Fase 2 langkah 2: AP aging (lintas-PO) + bukti pembayaran per termin
	auth.GET("/payment-schedules", handlers.ListAllPaymentSchedules)
	auth.POST("/purchase-orders/:id/payment-schedules/:scheduleId/proof", handlers.UploadPaymentProof)
	auth.GET("/purchase-orders/:id/payment-schedules/:scheduleId/proof/download", handlers.DownloadPaymentProof)

	// ===============================
	// META (Memo Tagih, Operations) -> INVOICE (Finance)
	// Fase 2 langkah 1. Mirror pola PR->PO (Fase 1 langkah 7).
	// ===============================
	auth.GET("/billing-requests", handlers.ListBillingRequests)
	auth.GET("/billing-requests/:id", handlers.GetBillingRequest)
	auth.POST("/billing-requests", handlers.CreateBillingRequest)
	auth.POST("/billing-requests/:id/submit", handlers.SubmitBillingRequest)

	auth.GET("/invoices", handlers.ListInvoices)
	auth.GET("/invoices/:id", handlers.GetInvoice)
	auth.POST("/invoices", handlers.CreateInvoice)
	auth.PUT("/invoices/:id/status", handlers.UpdateInvoiceStatus)
	auth.GET("/ar-ap-aging-summary", handlers.GetARAPAgingSummary)

	// ===============================
	// BAST VENDOR & BAST CUSTOMER (Fase 1 langkah 8, penutup siklus fisik)
	// ===============================
	auth.GET("/bast-vendor", handlers.ListBASTVendor)
	auth.GET("/bast-vendor/:id", handlers.GetBASTVendor)
	auth.POST("/bast-vendor", handlers.CreateBASTVendor)

	auth.GET("/bast-customer", handlers.ListBASTCustomer)
	auth.GET("/bast-customer/:id", handlers.GetBASTCustomer)
	auth.POST("/bast-customer", handlers.CreateBASTCustomer)

	// ===============================
	// CUSTOMER ROUTES
	// ===============================
	auth.GET("/customers", handlers.GetCustomers)
	auth.GET("/customers/:id", handlers.GetCustomer)
	auth.POST("/customers", handlers.CreateCustomer)
	auth.PUT("/customers/:id", handlers.UpdateCustomer)
	auth.DELETE("/customers/:id", handlers.DeleteCustomer)

	// ===============================
	// NON-PROJECT WORK: POC/Demo & Internal Dev Request
	// ===============================
	auth.GET("/work-requests", handlers.ListWorkRequests)
	auth.POST("/work-requests", handlers.CreateWorkRequest)
	auth.PUT("/work-requests/:id", handlers.UpdateWorkRequest)
	auth.PUT("/work-requests/:id/status", handlers.UpdateWorkRequestStatus)
	auth.DELETE("/work-requests/:id", handlers.DeleteWorkRequest)
	auth.GET("/work-requests/:id/attachments", handlers.ListWorkRequestAttachments)
	auth.POST("/work-requests/:id/attachments", handlers.UploadWorkRequestAttachment)
	auth.GET("/work-requests/:id/attachments/:attachmentId/download", handlers.DownloadWorkRequestAttachment)
	auth.DELETE("/work-requests/:id/attachments/:attachmentId", handlers.DeleteWorkRequestAttachment)
	auth.GET("/work-requests/:id/updates", handlers.ListWorkRequestUpdates)
	auth.POST("/work-requests/:id/updates", handlers.CreateWorkRequestUpdate)
	auth.DELETE("/work-requests/:id/updates/:updateId", handlers.DeleteWorkRequestUpdate)
	auth.GET("/work-requests/:id/tasks", handlers.ListWorkRequestTasks)
	auth.POST("/work-requests/:id/tasks", handlers.CreateWorkRequestTask)
	auth.PUT("/work-requests/:id/tasks/:taskId", handlers.UpdateWorkRequestTask)
	auth.DELETE("/work-requests/:id/tasks/:taskId", handlers.DeleteWorkRequestTask)

	// ===============================
	// VENDOR ROUTES (master data, prasyarat Purchase Order Fase 1 langkah 7)
	// ===============================
	auth.GET("/vendors", handlers.GetVendors)
	auth.GET("/vendors/:id", handlers.GetVendor)
	auth.POST("/vendors", middleware.RequirePermission("vendors.manage"), handlers.CreateVendor)
	auth.PUT("/vendors/:id", middleware.RequirePermission("vendors.manage"), handlers.UpdateVendor)
	auth.DELETE("/vendors/:id", middleware.RequirePermission("vendors.manage"), handlers.DeleteVendor)

	// ===============================
	// DASHBOARD ROUTES
	// ===============================
	auth.GET("/dashboard", handlers.GetDashboard)

	// ===============================
	// BUDGET ROUTES
	// ===============================
	budgets := auth.Group("/budgets")
	{
		// NON-WILDCARD FIRST
		budgets.POST("", handlers.CreateBudget)
		budgets.GET("", handlers.ListBudgets)
		budgets.GET("/trend", handlers.GetBudgetTrend)

		// REALIZATIONS FIRST (before :budgetId)
		realizations := budgets.Group("/:budgetId/realizations")
		{
			realizations.POST("", handlers.AddRealization)
			realizations.PUT("/:realizationId", handlers.UpdateRealization)
			realizations.DELETE("/:realizationId", handlers.DeleteRealization)
		}

		// WILDCARD LAST (budget detail)
		budgets.GET("/:budgetId", handlers.GetBudgetDetail)
		budgets.PUT("/:budgetId", handlers.UpdateBudget)
	}

	// ===============================
	// CHART OF ACCOUNTS (Fase 3 Langkah 1)
	// ===============================
	auth.GET("/chart-of-accounts", handlers.ListChartOfAccounts)
	auth.POST("/chart-of-accounts", handlers.CreateAccount)
	auth.PUT("/chart-of-accounts/:id", handlers.UpdateAccount)
	auth.DELETE("/chart-of-accounts/:id", handlers.DeleteAccount)

	// ===============================
	// GENERAL LEDGER (Fase 3 Langkah 2)
	// ===============================
	auth.POST("/journal-entries", handlers.CreateJournalEntry)
	auth.GET("/journal-entries", handlers.ListJournalEntries)
	auth.GET("/journal-entries/:id", handlers.GetJournalEntry)
	auth.GET("/balance-sheet", handlers.GetBalanceSheet)
	auth.GET("/income-statement", handlers.GetIncomeStatement)
	auth.GET("/cash-flow-statement", handlers.GetCashFlowStatement)

	// ===============================
	// CASH & BANK (Fase 4 Langkah 3, multi-rekening via hierarki COA)
	// ===============================
	auth.GET("/cash-bank-summary", handlers.GetCashBankSummary)

	// ===============================
	// ITEM CATALOG (Fase 4 Langkah 1)
	// ===============================
	auth.GET("/item-catalog", handlers.ListItemCatalog)
	auth.POST("/item-catalog", handlers.CreateItemCatalog)
	auth.PUT("/item-catalog/:id", handlers.UpdateItemCatalog)
	auth.DELETE("/item-catalog/:id", handlers.DeleteItemCatalog)
}
