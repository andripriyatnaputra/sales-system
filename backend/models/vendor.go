package models

import "time"

type Vendor struct {
	ID                int64     `json:"id"`
	Code              string    `json:"code"`
	Name              string    `json:"name"`
	Category          *string   `json:"category,omitempty"`
	NPWP              *string   `json:"npwp,omitempty"`
	ContactPerson     *string   `json:"contact_person,omitempty"`
	Phone             *string   `json:"phone,omitempty"`
	Email             *string   `json:"email,omitempty"`
	Address           *string   `json:"address,omitempty"`
	BankName          *string   `json:"bank_name,omitempty"`
	BankAccountNumber *string   `json:"bank_account_number,omitempty"`
	BankAccountHolder *string   `json:"bank_account_holder,omitempty"`
	Status            string    `json:"status"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
