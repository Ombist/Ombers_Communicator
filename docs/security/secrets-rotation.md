# Secrets Rotation SOP

## Scope

- `OMBERS_AUTH_TOKEN`
- Any reverse proxy API secrets and certificates used to protect relay ingress.

## Rotation Types

- Scheduled rotation: every 30 days.
- Emergency rotation: immediately after suspected leak.

## Procedure

1. Generate new secret in approved secret manager.
2. Deploy secret to staging, run smoke tests.
3. Deploy to production during approved window.
4. Validate upgrade auth success and rejection metrics.
5. Revoke old secret.
6. Record change ticket and operator in audit log.

## Rollback

- Keep previous secret for a short overlap window.
- Revert deployment to previous known-good secret version if auth failures exceed threshold.

## Evidence

- Rotation date/time
- Operator
- Ticket/PR ID
- Validation results
