# Release Checklist Reference

Use this 6-gate release checklist before production rollout.

## Gate 1: Build and Lint

- [ ] Backend build succeeds
- [ ] Frontend build succeeds
- [ ] Lint/type checks pass

## Gate 2: Tests

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Smoke/e2e checks pass

## Gate 3: Security and Config

- [ ] Required env vars present
- [ ] CORS origins validated
- [ ] Security headers and rate limits enabled
- [ ] No secrets in repository or logs

## Gate 4: Data and Migrations

- [ ] Migrations reviewed and reversible
- [ ] Rollback plan documented
- [ ] Backups/checkpoints confirmed

## Gate 5: Runtime Readiness

- [ ] `/health` and `/ready` pass
- [ ] Logging and request IDs verified
- [ ] Alerts and dashboards available

## Gate 6: Rollout

- [ ] Canary or phased rollout strategy defined
- [ ] Post-deploy smoke checks defined
- [ ] Owner and incident contact assigned
