# Auth Flow Reference

Use this reference for JWT bearer flow, refresh tokens, Next.js SSR auth, RBAC, and middleware order.

## Recommended Baseline

- Access token lifetime: 10-20 minutes
- Refresh token lifetime: 7-30 days
- Refresh token storage: httpOnly, secure cookie
- Access token storage: memory (not localStorage)

## Backend Flow

1. `POST /api/auth/login` validates credentials.
2. Server issues:
   - access token in JSON response
   - refresh token in httpOnly cookie
3. Client sends access token as `Authorization: Bearer <token>`.
4. On access token expiry (`401`), client calls `POST /api/auth/refresh` with cookie.
5. Server rotates refresh token and returns new access token.
6. `POST /api/auth/logout` invalidates refresh token server-side and clears cookie.

## Middleware Order (Auth Relevant)

Request -> RequestID -> Logging -> CORS -> RateLimit -> BodyParser -> Auth -> Authz -> Validation -> Handler -> ErrorHandler

## RBAC Pattern

- Attach `userId` and `roles` to request context in auth middleware.
- Use route-level authorization middleware.
- Deny by default when role is missing.

## Security Rules

- Never store tokens in URL query params.
- Never include sensitive data in JWT payload.
- Rotate signing keys periodically.
- Add replay protection and token revocation checks for refresh tokens.
- Log auth failures with request ID but without secrets.

## Next.js SSR Notes

- Read auth from cookies in server components/route handlers.
- Keep refresh token in cookie-only channel.
- Avoid exposing raw token values to the client bundle.
