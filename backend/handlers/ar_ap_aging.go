package handlers

import (
	"context"
	"net/http"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

// bucketOrder: urutan TETAP dipakai simetris utk AR dan AP, supaya chart
// frontend selalu 5 bucket konsisten -- bucket yang tidak ada barisnya
// tetap muncul dgn 0 (diisi di Go, bukan cuma yang di-return SQL).
var bucketOrder = []string{"Belum Jatuh Tempo", "1-30 hari", "31-60 hari", "61-90 hari", ">90 hari"}

type AgingBucket struct {
	Bucket string  `json:"bucket"`
	Count  int64   `json:"count"`
	Amount float64 `json:"amount"`
}

type ARAPSide struct {
	TotalOutstanding float64       `json:"total_outstanding"`
	TotalOverdue     float64       `json:"total_overdue"`
	Buckets          []AgingBucket `json:"buckets"`
}

type ARAPAgingSummary struct {
	AR          ARAPSide `json:"ar"`
	AP          ARAPSide `json:"ap"`
	NetPosition float64  `json:"net_position"`
}

const agingBucketCaseSQL = `
	CASE
		WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'Belum Jatuh Tempo'
		WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 hari'
		WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 hari'
		WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 hari'
		ELSE '>90 hari'
	END
`

func queryAgingBuckets(ctx context.Context, baseQuery string) (ARAPSide, error) {
	counts := map[string]int64{}
	amounts := map[string]float64{}

	rows, err := database.Pool.Query(ctx, baseQuery)
	if err != nil {
		return ARAPSide{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var bucket string
		var count int64
		var amount float64
		if err := rows.Scan(&bucket, &count, &amount); err != nil {
			continue
		}
		counts[bucket] = count
		amounts[bucket] = amount
	}

	side := ARAPSide{Buckets: make([]AgingBucket, 0, len(bucketOrder))}
	for _, b := range bucketOrder {
		amount := amounts[b]
		side.Buckets = append(side.Buckets, AgingBucket{Bucket: b, Count: counts[b], Amount: amount})
		side.TotalOutstanding += amount
		if b != "Belum Jatuh Tempo" {
			side.TotalOverdue += amount
		}
	}
	return side, nil
}

// GetARAPAgingSummary: gabungan AR (invoice belum lunas) + AP (termin vendor
// belum lunas) jadi satu ringkasan, dikelompokkan ke 5 bucket keterlambatan
// yang SAMA persis supaya bisa dibandingkan langsung. Read terbuka, sama
// pola ListAllPaymentSchedules/ListInvoices -- visibility diatur di Navbar.
func GetARAPAgingSummary(c *gin.Context) {
	ctx := c.Request.Context()

	arQuery := `
		SELECT ` + agingBucketCaseSQL + ` AS bucket, COUNT(*), COALESCE(SUM(amount + tax_amount), 0)
		FROM invoices
		WHERE status = 'sent'
		GROUP BY bucket
	`
	ar, err := queryAgingBuckets(ctx, arQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	apQuery := `
		SELECT ` + agingBucketCaseSQL + ` AS bucket, COUNT(*), COALESCE(SUM(amount), 0)
		FROM payment_schedules
		WHERE parent_type = 'vendor_po' AND status IN ('pending', 'due')
		GROUP BY bucket
	`
	ap, err := queryAgingBuckets(ctx, apQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ARAPAgingSummary{
		AR:          ar,
		AP:          ap,
		NetPosition: ar.TotalOutstanding - ap.TotalOutstanding,
	})
}
