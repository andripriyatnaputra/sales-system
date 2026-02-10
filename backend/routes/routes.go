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
	// ADMIN ONLY ROUTES
	// ===============================
	auth.POST("/users", middleware.AdminOnly(), handlers.CreateUser)
	auth.GET("/users", middleware.AdminOnly(), handlers.ListUsers)
	auth.PUT("/users/:id", middleware.AdminOnly(), handlers.UpdateUser)
	auth.DELETE("/users/:id", middleware.AdminOnly(), handlers.DeleteUser)

	// ===============================
	// PROJECT ROUTES
	// ===============================
	auth.POST("/projects", handlers.CreateProject)
	auth.GET("/projects", handlers.ListProjects)
	auth.GET("/projects/:id", handlers.GetProject)
	auth.PUT("/projects/:id", handlers.UpdateProject)
	auth.DELETE("/projects/:id", handlers.DeleteProject)
	auth.GET("/projects/export/csv", handlers.ExportProjectsCSV)

	auth.GET("/projects/:id/revenue-plan", handlers.GetRevenuePlan)
	auth.PUT("/projects/:id/realization/:month", handlers.UpdateRevenueRealization)
	auth.PUT("/projects/:id/postpo-monitoring", handlers.UpdatePostPOMonitoring)

	auth.GET("/projects/summary", handlers.GetProjectsSummary)

	// ===============================
	// CUSTOMER ROUTES
	// ===============================
	auth.GET("/customers", handlers.GetCustomers)
	auth.GET("/customers/:id", handlers.GetCustomer)
	auth.POST("/customers", handlers.CreateCustomer)
	auth.PUT("/customers/:id", handlers.UpdateCustomer)
	auth.DELETE("/customers/:id", handlers.DeleteCustomer)

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
}
