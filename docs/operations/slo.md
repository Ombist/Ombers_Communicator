# SLO and Error Budget

## Service Level Objective

- Availability SLO: 99.95% monthly for WebSocket upgrade success and relay service health.
- Measurement windows: rolling 30 days and calendar month.

## SLIs

- `upgrade_success_rate = successful_upgrades / total_upgrade_requests`
- `relay_delivery_rate = delivered_messages / attempted_relays`
- `health_endpoint_uptime = successful_health_checks / total_health_checks`

## Error Budget

- Monthly error budget: 0.05% downtime or failed requests.
- Burn alerts:
  - Fast burn: >10% budget consumed in 1 hour.
  - Slow burn: >25% budget consumed in 24 hours.

## Reporting

- Weekly SLO report in ops review.
- Monthly report includes burn trend, incident links, and corrective actions.
