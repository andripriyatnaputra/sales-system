package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sales-system-backend/database"

	"github.com/jackc/pgx/v5"
)

// =====================================================
//  DIVISION NORMALIZATION + VALIDATION
// =====================================================

// normalizeDivision menerima semua kemungkinan input
// dan mengembalikan
//
//	→ "NetCo"
//	→ "Oil Mining & Goverments"
//	→ "IT Solutions"
func NormalizeDivision(d string) string {
	d = strings.TrimSpace(strings.ToLower(d))

	switch d {
	// --- NETCO ---
	case "network communications", "network communication",
		"netco", "net co", "net-co", "net co.", "net-co.",
		"nc", "network-communications":
		return "NetCo"

	// --- OIL MINING & GOVERMENTS (NEW CANONICAL) ---
	case "oil gas & mining", "oil gas mining", "oil & gas mining",
		"oil & gas", "oil gas", "oil and gas", "oil & mining",
		"oil mining & governments", "oil mining & goverments",
		"oil mining and governments", "oil mining and goverments",
		"oil mining governments", "oil mining goverments",
		"oil gas & governments", "oil gas & goverments",
		"oil gas & government", "oil gas & goverment",
		"omg", "oil-mining-governments", "oil-mining-goverments":
		return "Oil Mining & Goverments"

	// --- IT SOLUTIONS ---
	case "it solutions", "it solution", "it-solutions", "it-solution",
		"itsol", "it sol":
		return "IT Solutions"
	}

	return strings.Title(d)
}

func isValidDivision(d string) bool {
	switch d {
	case "NetCo", "Oil Mining & Goverments", "IT Solutions":
		return true
	default:
		return false
	}
}

// =====================================================
//  DIVISION → SHORT CODE (for Project Code)
// =====================================================

func divisionCode(div string) string {
	normalized := NormalizeDivision(div)

	switch normalized {
	case "NetCo":
		return "NetCo"
	case "Oil Mining & Goverments":
		return "OMG" // biar konsisten dengan akronimnya
	case "IT Solutions":
		return "ITS"
	default:
		return "UNK"
	}
}

// =====================================================
//  PROJECT CODE GENERATOR
// =====================================================

func generateProjectCode(division string) string {
	year := time.Now().Year()
	code := divisionCode(division)

	// hitung jumlah project tahun ini
	var count int
	err := database.Pool.QueryRow(
		context.Background(),
		`SELECT COUNT(*)
		 FROM projects
		 WHERE EXTRACT(YEAR FROM created_at) = $1`,
		year,
	).Scan(&count)

	if err != nil {
		fmt.Println("warning: failed to count project codes:", err)
	}

	seq := count + 1

	// Format final: PRJ-ITS-2025-0001
	return fmt.Sprintf("PRJ-%s-%d-%04d", code, year, seq)
}

func generateProjectCodeTx(ctx context.Context, tx pgx.Tx, division string) (string, error) {
	loc := mustLoadLocation("Asia/Jakarta")
	year := time.Now().In(loc).Year()
	code := divisionCode(division)

	var seq int
	err := tx.QueryRow(ctx, `
		INSERT INTO project_code_counters (year, division_code, last_seq)
		VALUES ($1, $2, 1)
		ON CONFLICT (year, division_code)
		DO UPDATE SET last_seq = project_code_counters.last_seq + 1
		RETURNING last_seq
	`, year, code).Scan(&seq)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("PRJ-%s-%d-%04d", code, year, seq), nil
}

// =====================================================
//  BUDGET HELPERS
// =====================================================

func GetTotalRealization(ctx context.Context, budgetID int64) (float64, error) {
	var total float64

	err := database.Pool.QueryRow(
		ctx,
		`SELECT COALESCE(SUM(amount), 0)
         FROM budget_realization
         WHERE budget_id = $1`,
		budgetID,
	).Scan(&total)

	return total, err
}

func BudgetExists(ctx context.Context, division string, month time.Time) (bool, error) {
	var exists bool
	err := database.Pool.QueryRow(
		ctx,
		`SELECT EXISTS(
            SELECT 1 FROM budgets
            WHERE division = $1
              AND month = $2
        )`,
		NormalizeDivision(division),
		month,
	).Scan(&exists)

	return exists, err
}
