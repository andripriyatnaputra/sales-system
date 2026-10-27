package handlers

import (
	"errors"
	"net/http"
	"testing"
)

func TestIsApprovalPolicyError(t *testing.T) {
	policyErrors := []error{
		ErrApprovalMatrixNotConfigured,
		ErrApprovalManagerRequired,
		ErrApprovalApproverUnavailable,
		errors.Join(errors.New("context"), ErrApprovalManagerRequired),
	}

	for _, err := range policyErrors {
		if !IsApprovalPolicyError(err) {
			t.Fatalf("expected policy error for %v", err)
		}
	}

	if IsApprovalPolicyError(errors.New("database unavailable")) {
		t.Fatal("database failures must remain server errors")
	}
}

func TestApprovalSubmissionHTTPStatus(t *testing.T) {
	if got := approvalSubmissionHTTPStatus(ErrApprovalMatrixNotConfigured); got != http.StatusUnprocessableEntity {
		t.Fatalf("policy error status = %d, want %d", got, http.StatusUnprocessableEntity)
	}
	if got := approvalSubmissionHTTPStatus(errors.New("database unavailable")); got != http.StatusInternalServerError {
		t.Fatalf("server error status = %d, want %d", got, http.StatusInternalServerError)
	}
}

func TestApprovalManagerLevel(t *testing.T) {
	for _, level := range []string{"manager", "gm", "executive"} {
		if !isApprovalManagerLevel(level) {
			t.Fatalf("%s should be eligible as an approval manager", level)
		}
	}
	for _, level := range []string{"staff", "system_admin", ""} {
		if isApprovalManagerLevel(level) {
			t.Fatalf("%s should not be eligible as an approval manager", level)
		}
	}
}
