# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-03-26

### Changed

- Project and directory renamed to **Ombers Communicator** (`Ombers_Communicator`); npm package `ombers-communicator`.
- Health JSON `service` field and Prometheus metric names now use the `ombers-` prefix (`ombers_relay_messages_total`, `ombers_websocket_connections`).
- systemd unit file renamed to `ombers-communicator.service` (update `After=` / install paths if you depended on `openclaw-middleware.service`).

## [1.1.0] - 2025-03-26

### Added

- Structured logs when `LOG_FORMAT=json`.
- Optional Prometheus metrics: `GET /metrics` when `ENABLE_METRICS=true` (relay and connection series plus default process metrics).
- `WS_MAX_PAYLOAD_BYTES` (default 100 MiB) for WebSocket frame size limit.
- `MAX_TOTAL_CONNECTIONS` (optional): reject new WebSocket upgrades with HTTP 503 when exceeded.
- Unit tests (`node --test`) for `parseSessionPath`.
- GitHub Actions workflow (when this package lives under the Ombist monorepo root).
- `LICENSE` (MIT).

### Changed

- Console output routed through internal logger (default format unchanged).

## [1.0.0] - 2025-03-26

### Added

- Initial published behavior: multiplex and legacy `/ws` relay, health check, graceful shutdown, Docker healthcheck, integration test.
