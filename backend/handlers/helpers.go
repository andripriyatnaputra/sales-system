package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sales-system-backend/database"
)

// =====================================================
//  DIVISION NORMALIZATION + VALIDATION
// =====================================================

// normalizeDivision menerima semua kemungkinan input
// dan mengembalikan
//
//	→ "NetCo"
//	→ "Oil Gas & Mining"
//	→ "IT Solutions"
func NormalizeDivision(d string) string {
	d = strings.TrimSpace(strings.ToLower(d))

	switch d {
	// --- NETCO ---
	case "network communications", "network communication",
		"netco", "net co", "net-co", "net co.", "net-co.",
		"nc", "network-communications":
		return "NetCo"

	// --- OIL GAS & MINING ---
	case "oil gas & mining", "oil gas mining", "oil & gas mining",
		"oil & gas", "oil gas", "oil and gas", "oil & mining",
		"oil mining & governments", "oil gas & governments", "oil gas & government",
		"oil gas & goverments", "omg", "oil-mining-governments":
		return "Oil Gas & Mining"

	// --- IT SOLUTIONS ---
	case "it solutions", "it solution", "it-solutions", "it-solution",
		"itsol", "it sol":
		return "IT Solutions"
	}

	// default fallback → Title-case
	return strings.Title(d)
}

func isValidDivision(d string) bool {
	switch d {
	case "NetCo", "Oil Gas & Mining", "IT Solutions":
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
	case "Oil Gas & Mining":
		return "OGM"
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
