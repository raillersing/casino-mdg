# Shared Protos

This directory contains gRPC/protobuf definitions for inter-service communication.

## Services
- `wallet.proto` — Wallet & Ledger service
- `game.proto` — Game Engine events
- `notification.proto` — Push notifications
- `social.proto` — Clubs, friends, missions

## Usage

```bash
# Generate Go code
protoc --go_out=. --go-grpc_out=. wallet.proto

# Generate Python code
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. wallet.proto
```

## TODO
- Define actual protobuf schemas
- Set up protoc generation in CI
