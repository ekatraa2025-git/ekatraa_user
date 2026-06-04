# Database Schema Reference

## Schema Design

- Normalize core transactional entities.
- Denormalize only with measured performance justification.
- Add explicit constraints (unique, foreign keys, not null).

## Migrations

- Every schema change via migration.
- Migrations must be reviewable and reversible.
- Test migrations against representative data volume.

## Indexing

- Index frequent filters, joins, and sort columns.
- Avoid redundant indexes.
- Track query plans and regressions.

## Multi-Tenancy

- Choose model: shared schema with tenant ID, separate schemas, or separate DBs.
- Enforce tenant isolation at query boundary.

## Reliability

- Use transactions for multi-step writes.
- Set timeouts and connection pool limits.
