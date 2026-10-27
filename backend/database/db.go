package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

// Init initializes the PostgreSQL connection pool
func Init() error {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		return fmt.Errorf("DB_DSN is required")
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("error parsing DB config: %w", err)
	}

	// Optional: tune connection pool
	cfg.MaxConns = 10
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("error connecting to DB: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("DB ping error: %w", err)
	}

	Pool = pool
	log.Println("Connected to PostgreSQL")
	return nil
}

// Ready verifies that the database is reachable and that the minimum schema
// required by the production dashboard is present. It is used by the
// readiness endpoint, while /health remains a process liveness check.
func Ready(ctx context.Context) error {
	if Pool == nil {
		return fmt.Errorf("database pool is not initialized")
	}
	if err := Pool.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	var schemaReady bool
	if err := Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'users'
			  AND column_name IN ('read_only', 'last_login')
			GROUP BY table_schema, table_name
			HAVING COUNT(*) = 2
		)
	`).Scan(&schemaReady); err != nil {
		return fmt.Errorf("schema check failed: %w", err)
	}
	if !schemaReady {
		return fmt.Errorf("required users schema is not ready")
	}
	return nil
}
