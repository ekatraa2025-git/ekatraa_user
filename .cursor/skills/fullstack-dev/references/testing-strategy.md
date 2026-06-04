# Testing Strategy Reference

## Pyramid

- Unit tests: fast, isolated, business logic heavy
- Integration tests: repository + DB + API behavior
- End-to-end tests: full user flows
- Contract tests: frontend/backend schema compatibility

## Backend

- Mock repositories in service unit tests.
- Use a real test DB for integration tests.
- Test controllers for status codes, validation, and response shape.

## Frontend

- Test API client error mapping.
- Test loading, error, and success states.
- Test auth refresh and retry behavior.

## Required Gates

- Unit tests pass
- Integration tests pass
- Build passes for backend + frontend
- Critical e2e smoke tests pass

## Anti-Patterns

- Over-mocking integration boundaries
- Hitting production services in CI
- Ignoring flaky tests instead of fixing root cause
