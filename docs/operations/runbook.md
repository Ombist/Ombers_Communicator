# On-call Runbook

## Severity

- P1: Full outage, active customer impact, no workaround.
- P2: Partial degradation, workaround exists.
- P3: Minor issue, no immediate impact.

## First 15 Minutes

1. Acknowledge alert.
2. Validate with `GET /health` on both ports.
3. Check live logs: `journalctl -u ombers-communicator -f`.
4. Check metrics: connection count, upgrade rejections, relay errors.
5. If impact confirmed, open incident and assign commander.

## Standard Mitigations

- High upgrade rejection:
  - Verify `IP_ALLOWLIST`, token config, and rate limit env values.
  - Confirm reverse proxy and firewall rules.
- Relay errors spike:
  - Inspect downstream machine/phone connectivity.
  - Restart service if stuck: `systemctl restart ombers-communicator`.
- Capacity saturation:
  - Increase replicas or raise `MAX_TOTAL_CONNECTIONS` after risk review.

## TLS and ingress baseline checks

- Verify TLS termination is enabled and valid certificate is served by ingress/proxy.
- Verify HSTS is enabled on public HTTPS endpoint.
- Ensure only expected routes are exposed publicly (`/ws`, `/health`), keep `/metrics` private/protected.
- Validate source restrictions (security groups/firewall) for machine and phone ingress paths.

## Ingress certificate rotation checklist (production)

Automation should use ACME (Let’s Encrypt) or a **single** internal PKI pipeline—avoid hand-copied `fullchain.pem` on individual hosts.

**Alerts (calendar)**

- **T−30, T−14, T−7**: Page or ticket if `notAfter` is approaching or renewal job fails.
- Log every successful renewal to your change record (who, what FQDN, new `notAfter`).

**Staging validation before cutover**

```bash
echo | openssl s_client -servername "${RELAY_FQDN}" -connect "${RELAY_FQDN}:443" 2>/dev/null | openssl x509 -noout -dates -issuer -subject
```

**Overlap with iOS pinning (no forced same-day upgrade)**

- **Before T−0**: Ensure the **next** leaf pin is already in the **signed pin manifest** and/or app defaults, alongside the current pin (dual-pin window ≥ policy in [docs/ios-pin-rotation-calendar.md](../../../docs/ios-pin-rotation-calendar.md)).
- **T−0**: Switch ingress to present the new leaf; **do not** remove the old pin until the agreed window ends and client TLS/pin failure rates are unchanged vs baseline.
- **T+window end**: Remove old pin from manifest/defaults; optionally retire old cert material from the proxy after confirmation.

**Dry-run expiry alerting**

- Once per year (or after infra changes), prove staging alerts fire by temporarily lowering thresholds or using a short-lived test cert—record the ticket ID.

**Quarterly drill**

- Follow [docs/operations/cert-rotation-gameday.md](../../../docs/operations/cert-rotation-gameday.md).

## Escalation

- P1: page platform + backend owners immediately.
- P2: notify within 30 minutes.

## Exit Criteria

- Service stabilized for 30 minutes.
- SLI trend returns to normal baseline.
- Post-incident action items created with owners and deadlines.
