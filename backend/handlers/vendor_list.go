package handlers

import (
	"net/http"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func GetVendors(c *gin.Context) {
	status := c.Query("status")

	query := `
		SELECT id, code, name, category, npwp, contact_person, phone, email, address,
		       bank_name, bank_account_number, bank_account_holder, status, created_at, updated_at
		FROM vendors
	`
	args := []interface{}{}
	if status != "" {
		query += " WHERE status = $1"
		args = append(args, status)
	}
	query += " ORDER BY name ASC"

	rows, err := database.Pool.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query error"})
		return
	}
	defer rows.Close()

	list := []models.Vendor{}
	for rows.Next() {
		var v models.Vendor
		if err := rows.Scan(&v.ID, &v.Code, &v.Name, &v.Category, &v.NPWP, &v.ContactPerson, &v.Phone, &v.Email,
			&v.Address, &v.BankName, &v.BankAccountNumber, &v.BankAccountHolder, &v.Status, &v.CreatedAt, &v.UpdatedAt); err == nil {
			list = append(list, v)
		}
	}

	c.JSON(http.StatusOK, list)
}
