# Environment Management Reference

Use this reference for CORS, env vars per environment, and runtime configuration management.

## Environment Layers

- `.env.example`: committed defaults and required keys (dummy values only)
- `.env.local`: local machine overrides (never committed)
- Staging/production secrets: secret manager or deployment platform env store

## Rules

- Validate required env vars at startup.
- Fail fast if required values are missing or malformed.
- Keep all env parsing in one config module.
- Never access `process.env` directly in feature code.

## Example Keys

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `NEXT_PUBLIC_API_URL`

## CORS Baseline

- Use explicit origin allowlist.
- Allow credentials only when needed.
- Restrict methods and headers to known values.
- Never use `*` in production for authenticated APIs.

## Common CORS Issues

- **Issue:** Browser sends preflight and gets 404  
  **Fix:** Ensure `OPTIONS` is handled by CORS middleware.
- **Issue:** Cookies not sent cross-origin  
  **Fix:** `credentials: true`, same-site and secure cookie settings, explicit origin.
- **Issue:** Works in Postman but fails in browser  
  **Fix:** Confirm browser preflight response headers.

## Deployment Checklist

- [ ] Production env vars configured in deployment target
- [ ] `.env.example` updated for new keys
- [ ] Config validation test added
- [ ] Allowed origins include production frontend URL
- [ ] No secrets in logs
