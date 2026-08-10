FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install deps
RUN apk add --no-cache git

# Download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o game-engine .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/game-engine .

EXPOSE 8080

CMD ["./game-engine"]
