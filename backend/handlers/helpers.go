package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
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

// isSalesDivisionLocked: kunci `division` (NetCo/Oil Mining/IT Solutions -- lini
// bisnis/vertikal proyek) HANYA berlaku untuk departemen Sales. User dari
// departemen lain (ProDev/Operations/Procurement/Finance/HR GA & Legal) legacy
// role-nya juga "user", tapi division mereka cuma placeholder nama departemen
// (mis. "Product & Development") yang TIDAK PERNAH cocok dengan division project
// mana pun -- kalau dikunci sama seperti Sales, mereka jadi tidak bisa buka
// project sama sekali. BUG ditemukan 2026-07-21 saat testing modul dokumen project.
//
// department kosong (user lama yang belum sempat dapat role_id granular) tetap
// dianggap terkunci -- fail-closed, bukan fail-open, supaya tidak tiba-tiba
// membuka akses ke user yang belum jelas departemennya.
func isSalesDivisionLocked(c *gin.Context) bool {
	if c.GetString("role") != "user" {
		return false
	}
	department := c.GetString("department")
	return department == "" || department == "Sales"
}

// canManageProjectCore: cuma Sales (pemilik proses New Project/Quotation/Closing)
// dan admin yang boleh create/edit/delete field inti project (division, status,
// customer, SPH, revenue plan). Departemen lain (ProDev/Ops/Procurement/Finance/HR)
// hanya boleh baca + isi bagian mereka sendiri (presales section, BoQ, PR/PO, BAST)
// lewat endpoint masing-masing yang sudah requireDepartment.
func canManageProjectCore(c *gin.Context) bool {
	if c.GetString("role") == "admin" {
		return true
	}
	return c.GetString("department") == "Sales"
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
//  ACTIVITY AGING HELPER
// =====================================================

// daysBetween: dipakai hitung "aging" (turnaround) antar 2 titik waktu.
// nil kalau start nil (data lama sebelum kolom timestamp ini ada -- tidak
// bisa direkonstruksi, BUKAN dianggap 0 hari). end nil berarti "masih
// berjalan", dihitung sampai NOW().
func daysBetween(start *time.Time, end *time.Time) *int {
	if start == nil {
		return nil
	}
	e := time.Now()
	if end != nil {
		e = *end
	}
	days := int(e.Sub(*start).Hours() / 24)
	return &days
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

func validateAndNormalizeProjectFlow(body *models.CreateProjectRequest) error {
	body.PipelineStatus = strings.TrimSpace(body.PipelineStatus)
	if body.PipelineStatus == "" {
		body.PipelineStatus = "Active"
	}

	if body.PipelineStatus != "Active" &&
		body.PipelineStatus != "Hold" &&
		body.PipelineStatus != "Drop" &&
		body.PipelineStatus != "Closed" {
		return fmt.Errorf("invalid pipeline_status")
	}

	// PRE-SPH phase:
	// SPH lifecycle belum dimulai, jadi SPH fields harus kosong.
	// PipelineStatus boleh Active/Hold/Drop dan sales_stage tetap di posisi terakhir.
	if body.SphReleaseStatus != "Yes" {
		body.SphReleaseStatus = "No"
		body.SPHStatus = nil
		body.SPHRelease = nil
		body.SphNumber = nil
		body.SPHStatusReasonCategory = nil
		body.SPHStatusReasonNote = nil

		// Closed tidak valid untuk project yang belum release SPH.
		if body.PipelineStatus == "Closed" {
			body.PipelineStatus = "Active"
		}

		return nil
	}

	// POST-SPH phase:
	// SPH released hanya valid mulai Quotation.
	if body.SalesStage < 4 {
		return fmt.Errorf("SPH released project must be at least Quotation stage")
	}

	if body.SPHRelease == nil || strings.TrimSpace(*body.SPHRelease) == "" {
		return fmt.Errorf("sph_release_date is required when SPH Released = Yes")
	}

	// Kalau sudah released tapi SPH status kosong, default Open.
	if body.SPHStatus == nil || strings.TrimSpace(*body.SPHStatus) == "" {
		open := "Open"
		body.SPHStatus = &open
	}

	st := strings.TrimSpace(*body.SPHStatus)
	body.SPHStatus = &st

	if st != "Open" &&
		st != "Hold" &&
		st != "Win" &&
		st != "Loss" &&
		st != "Drop" {
		return fmt.Errorf("invalid sph_status")
	}

	// Setelah SPH released, SPH status menjadi source of truth untuk pipeline_status.
	switch st {
	case "Open":
		body.PipelineStatus = "Active"

	case "Hold":
		body.PipelineStatus = "Hold"

	case "Win", "Loss":
		body.PipelineStatus = "Closed"
		body.SalesStage = 6

	case "Drop":
		body.PipelineStatus = "Drop"
		body.SalesStage = 6
	}

	if (st == "Loss" || st == "Drop") &&
		(body.SPHStatusReasonCategory == nil ||
			strings.TrimSpace(*body.SPHStatusReasonCategory) == "") {
		return fmt.Errorf("sph_status_reason_category required for Loss/Drop")
	}

	if st != "Loss" && st != "Drop" {
		body.SPHStatusReasonCategory = nil
		body.SPHStatusReasonNote = nil
	}

	return nil
}
