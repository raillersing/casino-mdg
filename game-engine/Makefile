.PHONY: build run test clean dev fmt vet

build:
	go build -o bin/game-engine .

run:
	go run .

dev:
	air -c .air.toml

test:
	go test -v ./...

bench:
	go test -bench=. -benchmem ./...

clean:
	rm -rf bin/ tmp/

fmt:
	go fmt ./...

vet:
	go vet ./...

lint: fmt vet
	golangci-lint run

deps:
	go mod download
	go mod tidy
