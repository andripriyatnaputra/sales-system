package handlers

import (
	"net/http"

	"sales-system-backend/database"
	"sales-system-backend/models"

	"github.com/gin-gonic/gin"
)

func GetVendor(c *gin.Context) {
	id := c.Param("id")

	var v models.Vendor
	err := database.Pool.QueryRow(c, `
		SELECT id, code, name, category, npwp, contact_person, phone, email, address,
		       bank_name, bank_account_number, bank_account_holder, status, created_at, updated_at
		FROM vendors WHERE id = $1
	`, id).Scan(&v.ID, &v.Code, &v.Name, &v.Category, &v.NPWP, &v.ContactPerson, &v.Phone, &v.Email,
		&v.Address, &v.BankName, &v.BankAccountNumber, &v.BankAccountHolder, &v.Status, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vendor not found"})
		return
	}

	c.JSON(http.StatusOK, v)
}
