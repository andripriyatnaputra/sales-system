package handlers

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"os"

	"sales-system-backend/database"
)

// sendEmailAsync: kirim email best-effort di goroutine terpisah -- SMTP ke
// server luar bisa lambat, TIDAK BOLEH blok response HTTP pemanggil, pola
// sama filosofi "efek samping best-effort" (LogAudit/notifyApprovalStep)
// yang sudah dipakai di semua fitur sesi ini, cuma sekarang genuinely async
// krn network I/O eksternal (bukan cuma DB lokal yang cepat).
//
// Kalau SMTP_HOST belum di-set (kredensial belum disiapkan) -> no-op silent,
// supaya app TIDAK PERNAH gagal/crash gara-gara email belum dikonfigurasi.
func sendEmailAsync(to []string, subject, body string) {
	if len(to) == 0 {
		return
	}
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		return
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	user := os.Getenv("SMTP_USER")
	password := os.Getenv("SMTP_PASSWORD")
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = user
	}

	go func() {
		addr := fmt.Sprintf("%s:%s", host, port)
		var auth smtp.Auth
		if user != "" {
			auth = smtp.PlainAuth("", user, password, host)
		}

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
			from, to[0], subject, body)

		if err := smtp.SendMail(addr, auth, from, to, []byte(msg)); err != nil {
			log.Printf("warning: gagal kirim email ke %v: %v", to, err)
		}
	}()
}

// usersEmailsByDepartment: semua email user aktif di 1 departemen (2 jalur
// role->department: langsung ATAU lewat org_unit->department, pola SAMA
// PERSIS loadRoleContext di auth.go) -- dipakai kirim notifikasi email ke
// "departemen tujuan" (fulfiller) suatu request. User TANPA email terdaftar
// otomatis dilewati (bukan error).
func usersEmailsByDepartment(ctx context.Context, departmentKey string) ([]string, error) {
	rows, err := database.Pool.Query(ctx, `
		SELECT DISTINCT u.email
		FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN departments d ON d.id = r.department_id
		LEFT JOIN org_units ou ON ou.id = r.org_unit_id
		LEFT JOIN departments ou_dept ON ou_dept.id = ou.department_id
		WHERE COALESCE(d.key, ou_dept.key) = $1 AND u.email IS NOT NULL
	`, departmentKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	emails := []string{}
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err == nil {
			emails = append(emails, email)
		}
	}
	return emails, nil
}

// usersEmailsByIDs: email dari daftar user_id spesifik (BEDA dari
// usersEmailsByDepartment yang scope-nya 1 departemen) -- dipakai
// notifyApprovalStep krn di situ daftar approver SUDAH diresolve
// (approver_user_id tunggal ATAU usersWithRole), tinggal ambil emailnya.
func usersEmailsByIDs(ctx context.Context, userIDs []int64) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := database.Pool.Query(ctx, `SELECT email FROM users WHERE id = ANY($1) AND email IS NOT NULL`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	emails := []string{}
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err == nil {
			emails = append(emails, email)
		}
	}
	return emails, nil
}

// notifyDepartmentByEmail: helper gabungan -- resolve email departemen tujuan
// lalu kirim, silent-fail total kalau query email gagal (efek samping
// sekunder, tidak boleh menjatuhkan request utama yang sudah sukses).
func notifyDepartmentByEmail(ctx context.Context, departmentKey, subject, body string) {
	emails, err := usersEmailsByDepartment(ctx, departmentKey)
	if err != nil || len(emails) == 0 {
		return
	}
	sendEmailAsync(emails, subject, body)
}
