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
