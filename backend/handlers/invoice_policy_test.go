package handlers

import "testing"

func TestInvoiceAllowedTransitions(t *testing.T) {
	tests := []struct {
		name string
		from string
		to   string
		want bool
	}{
		{name: "draft can remain draft", from: "draft", to: "draft", want: true},
		{name: "draft can be sent", from: "draft", to: "sent", want: true},
		{name: "draft can be cancelled", from: "draft", to: "cancelled", want: true},
		{name: "draft cannot skip sent before paid", from: "draft", to: "paid", want: false},
		{name: "sent can remain sent", from: "sent", to: "sent", want: true},
		{name: "sent can be paid", from: "sent", to: "paid", want: true},
		{name: "sent can be cancelled", from: "sent", to: "cancelled", want: true},
		{name: "sent cannot return to draft", from: "sent", to: "draft", want: false},
		{name: "paid is terminal", from: "paid", to: "paid", want: true},
		{name: "paid cannot be cancelled", from: "paid", to: "cancelled", want: false},
		{name: "cancelled is terminal", from: "cancelled", to: "cancelled", want: true},
		{name: "cancelled cannot be sent", from: "cancelled", to: "sent", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := invoiceAllowedTransitions[tt.from][tt.to]
			if got != tt.want {
				t.Fatalf("invoiceAllowedTransitions[%q][%q] = %v, want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestInvoiceUnknownStatusHasNoTransitions(t *testing.T) {
	if got := invoiceAllowedTransitions["unknown"]["paid"]; got {
		t.Fatal("unknown invoice status must not allow any transition")
	}
}

func TestPaymentScheduleAllowedTransitions(t *testing.T) {
	tests := []struct {
		name string
		from string
		to   string
		want bool
	}{
		{name: "pending can remain pending", from: "pending", to: "pending", want: true},
		{name: "pending can become due", from: "pending", to: "due", want: true},
		{name: "pending cannot be paid directly", from: "pending", to: "paid", want: false},
		{name: "due can remain due", from: "due", to: "due", want: true},
		{name: "due can be paid", from: "due", to: "paid", want: true},
		{name: "due cannot return to pending", from: "due", to: "pending", want: false},
		{name: "paid is terminal", from: "paid", to: "paid", want: true},
		{name: "paid cannot be reopened", from: "paid", to: "due", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := paymentScheduleStatusTransitionAllowed(tt.from, tt.to)
			if got != tt.want {
				t.Fatalf("paymentScheduleStatusTransitionAllowed(%q, %q) = %v, want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestValidateInvoiceDates(t *testing.T) {
	tests := []struct {
		name    string
		issue   string
		due     string
		wantErr bool
	}{
		{name: "both dates omitted", wantErr: false},
		{name: "valid dates", issue: "2026-10-01", due: "2026-10-31", wantErr: false},
		{name: "same date is valid", issue: "2026-10-01", due: "2026-10-01", wantErr: false},
		{name: "due date before issue date", issue: "2026-10-31", due: "2026-10-01", wantErr: true},
		{name: "invalid issue date", issue: "01-10-2026", due: "2026-10-31", wantErr: true},
		{name: "invalid due date", issue: "2026-10-01", due: "31-10-2026", wantErr: true},
		{name: "issue date only", issue: "2026-10-01", wantErr: false},
		{name: "due date only", due: "2026-10-31", wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateInvoiceDates(tt.issue, tt.due); (err != nil) != tt.wantErr {
				t.Fatalf("validateInvoiceDates(%q, %q) error = %v, wantErr %v", tt.issue, tt.due, err, tt.wantErr)
			}
		})
	}
}
