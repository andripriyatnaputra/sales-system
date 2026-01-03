# Stage 1: Builder
FROM golang:1.23 AS builder

WORKDIR /app

# Copy go.mod & go.sum dulu untuk caching dep
COPY go.mod go.sum ./
RUN go mod download

# Copy semua source code
COPY . .

# 🔑 PENTING: pastikan module clean
RUN go mod tidy

# Build binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o server main.go

# Stage 2: Runtime (lebih ringan)
FROM alpine:3.18

WORKDIR /app

COPY --from=builder /app/server .
# kalau pakai .env untuk runtime, bisa di-copy juga (opsional)
# COPY .env .

EXPOSE 8080

CMD ["./server"]
