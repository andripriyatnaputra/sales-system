package handlers

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// journalLineInput: bentuk generik satu baris jurnal, dipakai bareng oleh
// CreateJournalEntry (manual) dan semua post*Journal di gl_auto_posting.go
// (auto-posting) lewat insertJournalEntryTx -- supaya logika insert
// header+baris cuma ditulis SEKALI.
type journalLineInput struct {
	AccountID int64
	ProjectID *int64
	Debit     float64
	Credit    float64
	Memo      *string
}

// insertJournalEntryTx: insert header (generate entry_number JE-%04d, pola
// sama PR/PO/BAST/Invoice) + semua baris, SEMUA dalam transaction yang
// SUDAH DIBUKA pemanggil (tx) -- caller yang commit/rollback. sourceID nil
// + sourceType="manual" utk jurnal manual; auto-posting isi keduanya
// supaya hasJournalEntryForSource bisa cek idempotensi.
func insertJournalEntryTx(ctx context.Context, tx pgx.Tx, sourceType string, sourceID *int64, entryDate time.Time, description string, createdBy int64, lines []journalLineInput) (int64, string, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		INSERT INTO journal_entries (entry_number, entry_date, description, source_type, source_id, created_by)
		VALUES ('', $1, $2, $3, $4, $5)
		RETURNING id
	`, entryDate, description, sourceType, sourceID, createdBy).Scan(&id)
	if err != nil {
		return 0, "", err
	}

	entryNumber := fmt.Sprintf("JE-%04d", id)
	if _, err := tx.Exec(ctx, `UPDATE journal_entries SET entry_number = $1 WHERE id = $2`, entryNumber, id); err != nil {
		return 0, "", err
	}

	for _, l := range lines {
		if _, err := tx.Exec(ctx, `
			INSERT INTO journal_entry_lines (journal_entry_id, account_id, project_id, debit, credit, memo)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, id, l.AccountID, l.ProjectID, l.Debit, l.Credit, l.Memo); err != nil {
			return 0, "", err
		}
	}

	return id, entryNumber, nil
}

// validateLedgerAccount: akun tujuan baris jurnal WAJIB aktif dan TIDAK
// boleh punya child aktif (akun header/rollup, bukan akun detail/leaf) --
// mencegah posting langsung ke akun ringkasan.
func validateLedgerAccount(ctx context.Context, accountID int64) (bool, string) {
	var status string
	err := database.Pool.QueryRow(ctx, `SELECT status FROM chart_of_accounts WHERE id = $1`, accountID).Scan(&status)
	if err != nil {
		return false, fmt.Sprintf("account_id %d tidak ditemukan", accountID)
	}
	if status != "active" {
		return false, fmt.Sprintf("account_id %d tidak aktif", accountID)
	}
	var childCount int
	if err := database.Pool.QueryRow(ctx, `
		SELECT count(*) FROM chart_of_accounts WHERE parent_id = $1 AND status = 'active'
	`, accountID).Scan(&childCount); err != nil {
		return false, "gagal validasi akun"
	}
	if childCount > 0 {
		return false, fmt.Sprintf("account_id %d adalah akun header (punya child aktif), tidak bisa diposting langsung", accountID)
	}
	return true, ""
}

// CreateJournalEntry: Finance only. Header + lines dibungkus 1 transaction
// -- kalau satu baris gagal, SELURUH entry di-rollback, tidak ada jurnal
// setengah-jadi (tidak balance) yang tersimpan.
func CreateJournalEntry(c *gin.Context) {
	if !requireDepartment(c, "Finance") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: hanya Finance yang bisa membuat jurnal"})
		return
	}

	var body struct {
		EntryDate   *string `json:"entry_date"`
		Description string  `json:"description"`
		Lines       []struct {
			AccountID int64   `json:"account_id"`
			ProjectID *int64  `json:"project_id"`
			Debit     float64 `json:"debit"`
			Credit    float64 `json:"credit"`
			Memo      *string `json:"memo"`
		} `json:"lines"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Description == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description wajib diisi"})
		return
	}
	if len(body.Lines) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "jurnal wajib minimal 2 baris (double-entry)"})
		return
	}

	var totalDebit, totalCredit float64
	for i, l := range body.Lines {
		hasDebit := l.Debit > 0
		hasCredit := l.Credit > 0
		if hasDebit == hasCredit {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("baris %d harus diisi TEPAT SATU dari debit/kredit (bukan keduanya, bukan tidak sama sekali)", i+1)})
			return
		}
		if ok, msg := validateLedgerAccount(c, l.AccountID); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("baris %d: %s", i+1, msg)})
			return
		}
		totalDebit += l.Debit
		totalCredit += l.Credit
	}
	if math.Abs(totalDebit-totalCredit) > 0.01 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("jurnal tidak balance: total debit %.2f, total kredit %.2f", totalDebit, totalCredit)})
		return
	}

	entryDate := time.Now()
	if body.EntryDate != nil && *body.EntryDate != "" {
		parsed, err := time.Parse("2006-01-02", *body.EntryDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "entry_date harus format YYYY-MM-DD"})
			return
		}
		entryDate = parsed
	}

	ctx := c.Request.Context()
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db transaction error"})
		return
	}
	defer tx.Rollback(ctx)

	lines := make([]journalLineInput, len(body.Lines))
	for i, l := range body.Lines {
		lines[i] = journalLineInput{AccountID: l.AccountID, ProjectID: l.ProjectID, Debit: l.Debit, Credit: l.Credit, Memo: l.Memo}
	}

	id, entryNumber, err := insertJournalEntryTx(ctx, tx, "manual", nil, entryDate, body.Description, c.GetInt64("user_id"), lines)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "journal_entry", strconv.FormatInt(id, 10), entryNumber, body)

	c.JSON(http.StatusCreated, gin.H{"id": id, "entry_number": entryNumber})
}

// ListJournalEntries: read terbuka. Total debit/kredit per entry DIHITUNG
// via SUM ter-agregasi di SQL (bukan fetch semua lines lalu buang) -- list
// TIDAK sertakan array lines mentah, biar ringan.
func ListJournalEntries(c *gin.Context) {
	query := `
		SELECT je.id, je.entry_number, je.entry_date, je.description, je.source_type, je.source_id,
		       je.created_by, COALESCE(u.username, ''), je.created_at, je.updated_at,
		       COALESCE(SUM(jel.debit), 0), COALESCE(SUM(jel.credit), 0)
		FROM journal_entries je
		LEFT JOIN users u ON u.id = je.created_by
		LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
		WHERE 1=1
	`
	args := []interface{}{}
	if from := c.Query("from"); from != "" {
		args = append(args, from)
		query += fmt.Sprintf(" AND je.entry_date >= $%d", len(args))
	}
	if to := c.Query("to"); to != "" {
		args = append(args, to)
		query += fmt.Sprintf(" AND je.entry_date <= $%d", len(args))
	}
	if accID := c.Query("account_id"); accID != "" {
		args = append(args, accID)
		query += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM journal_entry_lines jel2 WHERE jel2.journal_entry_id = je.id AND jel2.account_id = $%d)", len(args))
	}
	query += " GROUP BY je.id, u.username ORDER BY je.entry_date DESC, je.id DESC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.JournalEntry{}
	for rows.Next() {
		var je models.JournalEntry
		if err := rows.Scan(&je.ID, &je.EntryNumber, &je.EntryDate, &je.Description, &je.SourceType, &je.SourceID,
			&je.CreatedBy, &je.CreatedByUsername, &je.CreatedAt, &je.UpdatedAt, &je.TotalDebit, &je.TotalCredit); err == nil {
			list = append(list, je)
		}
	}
	c.JSON(http.StatusOK, list)
}

// GetJournalEntry: read terbuka, sertakan lines lengkap (join akun+project).
// Total debit/kredit dihitung di Go dari lines yang sudah di-fetch.
func GetJournalEntry(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var je models.JournalEntry
	err = database.Pool.QueryRow(c, `
		SELECT je.id, je.entry_number, je.entry_date, je.description, je.source_type, je.source_id,
		       je.created_by, COALESCE(u.username, ''), je.created_at, je.updated_at
		FROM journal_entries je
		LEFT JOIN users u ON u.id = je.created_by
		WHERE je.id = $1
	`, id).Scan(&je.ID, &je.EntryNumber, &je.EntryDate, &je.Description, &je.SourceType, &je.SourceID,
		&je.CreatedBy, &je.CreatedByUsername, &je.CreatedAt, &je.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "journal entry not found"})
		return
	}

	rows, err := database.Pool.Query(c, `
		SELECT jel.id, jel.journal_entry_id, jel.account_id, coa.account_code, coa.account_name,
		       jel.project_id, COALESCE(p.project_code, ''), jel.debit, jel.credit, jel.memo, jel.created_at
		FROM journal_entry_lines jel
		JOIN chart_of_accounts coa ON coa.id = jel.account_id
		LEFT JOIN projects p ON p.id = jel.project_id
		WHERE jel.journal_entry_id = $1
		ORDER BY jel.id
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	lines := []models.JournalEntryLine{}
	for rows.Next() {
		var l models.JournalEntryLine
		if err := rows.Scan(&l.ID, &l.JournalEntryID, &l.AccountID, &l.AccountCode, &l.AccountName,
			&l.ProjectID, &l.ProjectCode, &l.Debit, &l.Credit, &l.Memo, &l.CreatedAt); err == nil {
			lines = append(lines, l)
			je.TotalDebit += l.Debit
			je.TotalCredit += l.Credit
		}
	}
	je.Lines = lines

	c.JSON(http.StatusOK, je)
}
