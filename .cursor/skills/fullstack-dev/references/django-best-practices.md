# Django Best Practices Reference

## Architecture

- Keep views thin; move business rules into services/domain layer.
- Keep serializers focused on input/output contracts.
- Use repository/query modules for complex data access patterns.

## DRF API Patterns

- Validate input with serializers.
- Use explicit permissions and authentication classes.
- Keep pagination consistent across list endpoints.

## Security

- Enable CSRF/session protections where applicable.
- Restrict CORS to allowed origins.
- Keep secrets in environment, not settings files.

## Data

- Use migrations for all schema changes.
- Add indexes for high-cardinality filters.
- Use `select_related`/`prefetch_related` to prevent N+1.
