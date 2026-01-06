package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/routes"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	_ = godotenv.Load()

	// Initialize database
	if err := database.Init(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer database.Pool.Close()

	// Setup Gin router
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:3000",
			"http://202.50.203.136:3000",
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Register routes
	routes.Register(r)

	// Root route
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "sales-system-backend",
		})
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Port configuration
	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "8081"
	}

	// Graceful shutdown setup
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Run server in goroutine
	go func() {
		log.Println("Backend running on port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Gracefully stop server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting cleanly")
}
