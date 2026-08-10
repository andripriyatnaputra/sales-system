package handlers

import (
	"net/http"

	"sales-system-backend/database"

	"github.com/gin-gonic/gin"
)

func UpdateVendor(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Name              *string `json:"name"`
		Category          *string `json:"category"`
		NPWP              *string `json:"npwp"`
		ContactPerson     *string `json:"contact_person"`
		Phone             *string `json:"phone"`
		Email             *string `json:"email"`
		Address           *string `json:"address"`
		BankName          *string `json:"bank_name"`
		BankAccountNumber *string `json:"bank_account_number"`
		BankAccountHolder *string `json:"bank_account_holder"`
		Status            *string `json:"status"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Status != nil && *body.Status != "active" && *body.Status != "inactive" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	_, err := database.Pool.Exec(c, `
		UPDATE vendors
		SET name = COALESCE($1, name),
		    category = COALESCE($2, category),
		    npwp = COALESCE($3, npwp),
		    contact_person = COALESCE($4, contact_person),
		    phone = COALESCE($5, phone),
		    email = COALESCE($6, email),
		    address = COALESCE($7, address),
		    bank_name = COALESCE($8, bank_name),
		    bank_account_number = COALESCE($9, bank_account_number),
		    bank_account_holder = COALESCE($10, bank_account_holder),
		    status = COALESCE($11, status),
		    updated_at = NOW()
		WHERE id = $12
	`, body.Name, body.Category, body.NPWP, body.ContactPerson, body.Phone, body.Email, body.Address,
		body.BankName, body.BankAccountNumber, body.BankAccountHolder, body.Status, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	LogAudit(c, c.GetInt64("user_id"), "update", "vendor", id, "", body)

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}
