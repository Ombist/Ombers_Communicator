# ADR-001: Security Baseline for Ombers Communicator

## Status

Accepted

## Context

The relay processes untrusted network traffic and must be operated with least privilege and explicit ingress controls.

## Decision

- Run service as dedicated non-root user `omber`.
- Enforce systemd hardening in unit file.
- Add optional token authentication for WebSocket upgrades.
- Add IP allowlist and fixed-window upgrade rate limiting.
- Track rejected upgrades and relay errors via metrics.

## Consequences

- Better production safety posture and auditability.
- Additional operational overhead for token and allowlist management.
- Misconfiguration risk mitigated by runbook and rotation SOP.
