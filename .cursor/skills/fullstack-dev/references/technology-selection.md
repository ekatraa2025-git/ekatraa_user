# Technology Selection Reference

## Decision Inputs

- Team expertise and hiring profile
- Product constraints (latency, traffic, data complexity)
- Operational maturity (CI/CD, observability, on-call)
- Delivery speed and maintainability

## Typical Profiles

- **Startup velocity:** Node.js + TypeScript + Postgres + React/Next.js
- **Enterprise Python:** Django/FastAPI + Postgres + React/Vue
- **High-throughput systems:** Go + Postgres/Redis + React/HTMX

## Integration Choice

- REST: broad compatibility, simple tooling
- tRPC: strong TS end-to-end type safety
- GraphQL: flexible client-driven data selection
- gRPC: internal high-performance service communication

## Rules

- Prefer boring, well-supported defaults.
- Standardize one stack per product area where possible.
- Choose for long-term maintenance, not trend appeal.
