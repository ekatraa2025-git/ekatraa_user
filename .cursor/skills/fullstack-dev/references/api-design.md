# API Design Reference

## REST Conventions

- Resource-oriented URLs (`/api/orders/:id`)
- Correct HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`)
- Consistent status codes (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`)

## Response Shape

- Success payloads should be consistent.
- Error payloads should include code, message, and request ID.

## Pagination

- Cursor pagination for large/real-time datasets
- Offset pagination for small/simple datasets

## Versioning

- Prefer additive changes.
- Use explicit versioning for breaking changes (`/v1`, `/v2` or header strategy).

## Contracts

- Maintain OpenAPI or equivalent contract.
- Use contract tests between frontend and backend.
