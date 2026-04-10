# ---- Build stage ----
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Cache deps before copying source
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

# ---- Runtime stage ----
FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/server .

USER app
EXPOSE 8080

CMD ["./server"]
