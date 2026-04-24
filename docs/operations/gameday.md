# GameDay Playbook

Run quarterly. Every scenario must have: hypothesis, blast radius, rollback path, success metrics.

## Scenarios

1. Downstream disconnect storm:
   - Simulate repeated machine-side disconnects.
2. High concurrency spike:
   - Burst upgrades to trigger connection limits.
3. Host pressure:
   - CPU and memory stress while active relay traffic flows.
4. Misconfiguration:
   - Wrong auth token or allowlist deployed.

## Checklist

- [ ] Incident channel created
- [ ] Commander and scribe assigned
- [ ] Metrics dashboard open
- [ ] Rollback command verified before injection
- [ ] Incident template filled during exercise
- [ ] Action items exported to backlog
