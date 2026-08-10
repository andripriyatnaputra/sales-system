package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func CreateVendor(c *gin.Context) {
	var body struct {
		Name              string  `json:"name"`
		Category          *string `json:"category"`
		NPWP              *string `json:"npwp"`
		ContactPerson     *string `json:"contact_person"`
		Phone             *string `json:"phone"`
		Email             *string `json:"email"`
		Address           *string `json:"address"`
		BankName          *string `json:"bank_name"`
		BankAccountNumber *string `json:"bank_account_number"`
		BankAccountHolder *string `json:"bank_account_holder"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	var id int64
	err := database.Pool.QueryRow(c, `
		INSERT INTO vendors (code, name, category, npwp, contact_person, phone, email, address, bank_name, bank_account_number, bank_account_holder)
		VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`, body.Name, body.Category, body.NPWP, body.ContactPerson, body.Phone, body.Email, body.Address,
		body.BankName, body.BankAccountNumber, body.BankAccountHolder).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	code := fmt.Sprintf("VND-%04d", id)
	_, err = database.Pool.Exec(c, `UPDATE vendors SET code = $1 WHERE id = $2`, code, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "create", "vendor", fmt.Sprintf("%d", id), body.Name, body)

	c.JSON(http.StatusCreated, gin.H{"id": id, "code": code})
}
