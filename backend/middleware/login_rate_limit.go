package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	loginRateLimitWindow = 15 * time.Minute
	loginRateLimitMax    = 10
)

var loginAttempts = struct {
	sync.Mutex
	byIP map[string][]time.Time
}{byIP: make(map[string][]time.Time)}

// LoginRateLimit limits login requests per client IP. It is intentionally
// applied before password verification so an attacker cannot use the login
// endpoint as an unlimited password oracle. The state is process-local; a
// shared limiter can replace this when the API is scaled horizontally.
func LoginRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		ip := c.ClientIP()

		loginAttempts.Lock()
		cutoff := now.Add(-loginRateLimitWindow)
		for key, attempts := range loginAttempts.byIP {
			kept := attempts[:0]
			for _, at := range attempts {
				if at.After(cutoff) {
					kept = append(kept, at)
				}
			}
			if len(kept) == 0 {
				delete(loginAttempts.byIP, key)
			} else {
				loginAttempts.byIP[key] = kept
			}
		}

		attempts := loginAttempts.byIP[ip]
		if len(attempts) >= loginRateLimitMax {
			retryAfter := int(time.Until(attempts[0].Add(loginRateLimitWindow)).Seconds())
			if retryAfter < 1 {
				retryAfter = 1
			}
			loginAttempts.Unlock()
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts; try again later"})
			c.Abort()
			return
		}

		loginAttempts.byIP[ip] = append(attempts, now)
		loginAttempts.Unlock()
		c.Next()
	}
}
