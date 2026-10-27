package handlers

import (
	"errors"
	"os"
	"strings"
)

// GetJWTSecret returns the signing key configured by the deployment
// environment. There is intentionally no fallback secret: starting with a
// known/default key would allow anyone who knows the source code to forge
// production tokens.
func GetJWTSecret() ([]byte, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	if len(secret) < 32 {
		return nil, errors.New("JWT_SECRET must be at least 32 characters")
	}
	return []byte(secret), nil
}
