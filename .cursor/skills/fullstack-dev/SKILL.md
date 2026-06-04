---
name: fullstack-dev
description: Full-stack backend architecture and frontend-backend integration guide. TRIGGER when: building a full-stack app, creating REST API with frontend, scaffolding backend service, building todo app, building CRUD app, building real-time app, building chat app, Express + React, Next.js API, Node.js backend, Python backend, Go backend, designing service layers, implementing error handling, managing config/auth, setting up API clients, implementing auth flows, handling file uploads, adding real-time features (SSE/WebSocket), hardening for production. DO NOT TRIGGER when: pure frontend UI work, pure CSS/styling, database schema only.
license: MIT
category: full-stack
version: 1.0.0
sources:
  - The Twelve-Factor App (12factor.net)
  - Clean Architecture (Robert C. Martin)
  - Domain-Driven Design (Eric Evans)
  - Patterns of Enterprise Application Architecture (Martin Fowler)
  - Martin Fowler (Testing Pyramid, Contract Tests)
  - Google SRE Handbook (Release Engineering)
  - ThoughtWorks Technology Radar
  - Full-Stack Development Practices
---

# Fullstack Dev

Full-stack backend architecture and frontend-backend integration guide.

## Scope

USE this skill when:

- Building a full-stack application (backend + frontend)
- Scaffolding a new backend service or API
- Designing service layers and module boundaries
- Implementing database access, caching, or background jobs
- Writing error handling, logging, or configuration management
- Reviewing backend code for architectural issues
- Hardening for production
- Setting up API clients, auth flows, file uploads, or real-time features

NOT for:

- Pure frontend/UI concerns (use your frontend framework's docs)
- Pure database schema design without backend context

## MANDATORY WORKFLOW — Follow These Steps In Order

When this skill is triggered, you MUST follow this workflow before writing any code.

### Step 0: Gather Requirements

Before scaffolding anything, ask the user to clarify (or infer from context):

- Stack: Language/framework for backend and frontend (e.g., Express + React, Django + Vue, Go + HTMX)
- Service type: API-only, full-stack monolith, or microservice?
- Database: SQL (PostgreSQL, SQLite, MySQL) or NoSQL (MongoDB, Redis)?
- Integration: REST, GraphQL, tRPC, or gRPC?
- Real-time: Needed? If yes — SSE, WebSocket, or polling?
- Auth: Needed? If yes — JWT, session, OAuth, or third-party (Clerk, Auth.js)?

If the user has already specified these in their request, skip asking and proceed.

### Step 1: Architectural Decisions

Based on requirements, make and state these decisions before coding:

| Decision | Options | Reference |
|---|---|---|
| Project structure | Feature-first (recommended) vs layer-first | Section 1 |
| API client approach | Typed fetch / React Query / tRPC / OpenAPI codegen | Section 5 |
| Auth strategy | JWT + refresh / session / third-party | Section 6 |
| Real-time method | Polling / SSE / WebSocket | Section 11 |
| Error handling | Typed error hierarchy + global handler | Section 3 |

Briefly explain each choice (1 sentence per decision).

### Step 2: Scaffold with Checklist

Use the appropriate checklist below. Ensure ALL checked items are implemented — do not skip any.

### Step 3: Implement Following Patterns

Write code following the patterns in this document. Reference specific sections as you implement each part.

### Step 4: Test & Verify

After implementation, run these checks before claiming completion:

Build check: Ensure both backend and frontend compile without errors

```bash
# Backend
cd server && npm run build

# Frontend
cd client && npm run build
```

Start & smoke test: Start the server, verify key endpoints return expected responses

```bash
# Start server, then test
curl http://localhost:3000/health
curl http://localhost:3000/api/<resource>
```

Integration check: Verify frontend can connect to backend (CORS, API base URL, auth flow)

Real-time check (if applicable): Open two browser tabs, verify changes sync

If any check fails, fix the issue before proceeding.

### Step 5: Handoff Summary

Provide a brief summary to the user:

- What was built: List of implemented features and endpoints
- How to run: Exact commands to start backend and frontend
- What's missing / next steps: Any deferred items, known limitations, or recommended improvements
- Key files: List the most important files the user should know about

## Quick Start — New Backend Service Checklist

- [ ] Project scaffolded with feature-first structure
- [ ] Configuration centralized, env vars validated at startup (fail fast)
- [ ] Typed error hierarchy defined (not generic Error)
- [ ] Global error handler middleware
- [ ] Structured JSON logging with request ID propagation
- [ ] Database: migrations set up, connection pooling configured
- [ ] Input validation on all endpoints (Zod / Pydantic / Go validator)
- [ ] Authentication middleware in place
- [ ] Health check endpoints (`/health`, `/ready`)
- [ ] Graceful shutdown handling (SIGTERM)
- [ ] CORS configured (explicit origins, not `*`)
- [ ] Security headers (helmet or equivalent)
- [ ] `.env.example` committed (no real secrets)

## Quick Start — Frontend-Backend Integration Checklist

- [ ] API client configured (typed fetch wrapper, React Query, tRPC, or OpenAPI generated)
- [ ] Base URL from environment variable (not hardcoded)
- [ ] Auth token attached to requests automatically (interceptor / middleware)
- [ ] Error handling — API errors mapped to user-facing messages
- [ ] Loading states handled (skeleton/spinner, not blank screen)
- [ ] Type safety across the boundary (shared types, OpenAPI, or tRPC)
- [ ] CORS configured with explicit origins (not `*` in production)
- [ ] Refresh token flow implemented (httpOnly cookie + transparent retry on 401)

## Quick Navigation

| Need to... | Jump to |
|---|---|
| Organize project folders | 1. Project Structure |
| Manage config + secrets | 2. Configuration |
| Handle errors properly | 3. Error Handling |
| Write database code | 4. Database Access Patterns |
| Set up API client from frontend | 5. API Client Patterns |
| Add auth middleware | 6. Auth & Middleware |
| Set up logging | 7. Logging & Observability |
| Add background jobs | 8. Background Jobs |
| Implement caching | 9. Caching |
| Upload files (presigned URL, multipart) | 10. File Upload Patterns |
| Add real-time features (SSE, WebSocket) | 11. Real-Time Patterns |
| Handle API errors in frontend UI | 12. Cross-Boundary Error Handling |
| Harden for production | 13. Production Hardening |
| Design API endpoints | [references/api-design.md](references/api-design.md) |
| Design database schema | [references/db-schema.md](references/db-schema.md) |
| Auth flow (JWT, refresh, Next.js SSR, RBAC) | [references/auth-flow.md](references/auth-flow.md) |
| CORS, env vars, environment management | [references/environment-management.md](references/environment-management.md) |

## Core Principles (7 Iron Rules)

1. Organize by FEATURE, not by technical layer
2. Controllers never contain business logic
3. Services never import HTTP request/response types
4. All config from env vars, validated at startup, fail fast
5. Every error is typed, logged, and returns consistent format
6. All input validated at the boundary — trust nothing from client
7. Structured JSON logging with request ID — not `console.log`

## 1. Project Structure & Layering (CRITICAL)

Controller (HTTP) -> Service (Business Logic) -> Repository (Data Access)

| Layer | Responsibility | Never |
|---|---|---|
| Controller | Parse request, validate, call service, format response | Business logic, DB queries |
| Service | Business rules, orchestration, transaction mgmt | HTTP types (`req`/`res`), direct DB |
| Repository | Database queries, external API calls | Business logic, HTTP types |

Dependency injection is required across all languages.

## 2. Configuration & Environment (CRITICAL)

Rules:

- All config via environment variables (Twelve-Factor)
- Validate required vars at startup — fail fast
- Type-cast at config layer, not at usage sites
- Commit `.env.example` with dummy values
- Never hardcode secrets, URLs, or credentials
- Never commit `.env` files
- Never scatter `process.env` / `os.environ` throughout code

## 3. Error Handling & Resilience (HIGH)

Rules:

- Typed, domain-specific error classes
- Global error handler catches everything
- Operational errors -> structured response
- Programming errors -> log + generic 500
- Retry transient failures with exponential backoff
- Never catch and ignore errors silently
- Never return stack traces to client
- Never throw generic `Error('something')`

## 4. Database Access Patterns (HIGH)

Rules:

- Schema changes via migrations, never manual SQL
- Migrations must be reversible
- Review migration SQL before production
- Use transactions for multi-step writes
- Prevent N+1 queries with joins/includes
- Configure connection pooling and timeouts
- Never modify production schema manually

## 5. API Client Patterns (MEDIUM)

Choose one and document why:

- Typed fetch wrapper
- React Query + typed client (recommended for React)
- tRPC (same team owns both TypeScript sides)
- OpenAPI generated client (public/multi-consumer APIs)

## 6. Authentication & Middleware (HIGH)

Standard middleware order:

Request -> 1.RequestID -> 2.Logging -> 3.CORS -> 4.RateLimit -> 5.BodyParse
-> 6.Auth -> 7.Authz -> 8.Validation -> 9.Handler -> 10.ErrorHandler -> Response

JWT rules:

- Short expiry access token (15min) + refresh token (server-stored)
- Minimal claims: `userId`, `roles`
- Rotate signing keys periodically
- Never store tokens in `localStorage`
- Never pass tokens in URL query params

## 7. Logging & Observability (MEDIUM-HIGH)

Rules:

- Structured JSON logging
- Request ID in every log entry
- Log at layer boundaries
- Never log passwords, tokens, PII, or secrets
- Never use `console.log` in production code

## 8. Background Jobs & Async (MEDIUM)

Rules:

- All jobs must be idempotent
- Retry failures (max 3), then DLQ, then alert
- Workers run as separate processes
- Never put long-running tasks in request handlers
- Never assume jobs run exactly once

## 9. Caching Patterns (MEDIUM)

Rules:

- Always set TTL
- Invalidate on write
- Use cache for reads, never authoritative state
- Never cache without expiry

Suggested TTL:

- User profile: 5-15 min
- Product catalog: 1-5 min
- Config / feature flags: 30-60 sec
- Session: match session duration

## 10. File Upload Patterns (MEDIUM)

Prefer presigned URL for larger files:

1. Client requests presign from backend
2. Backend returns `uploadUrl` and `fileKey`
3. Client uploads directly to object storage
4. Client saves file reference via backend API

Use multipart only for small files (typically <10MB).

## 11. Real-Time Patterns (MEDIUM)

- Polling: simple status checks, low client count
- SSE: one-way server -> client (notifications, streaming AI)
- WebSocket: bidirectional (chat, collaboration, gaming)

## 12. Cross-Boundary Error Handling (MEDIUM)

Rules:

- Map API status codes to user-facing messages
- Show field-level validation errors near inputs
- Retry only 5xx, never 4xx
- Redirect to login on 401 after refresh attempt fails
- Show offline message when fetch fails
- Never show raw API error strings to users
- Never swallow errors silently

## 13. Production Hardening (MEDIUM)

Required:

- `/health` liveness endpoint
- `/ready` readiness endpoint
- Graceful shutdown (`SIGTERM`)
- CORS explicit origins
- Security headers
- Rate limiting
- HTTPS
- Input validation on all endpoints

## Anti-Patterns

- Business logic in routes/controllers -> move to service layer
- `process.env` scattered everywhere -> centralized typed config
- `console.log` for logging -> structured JSON logger
- Generic `Error('oops')` -> typed error hierarchy
- Direct DB calls in controllers -> repository pattern
- No input validation -> validate at boundary
- No health/readiness checks -> add `/health` + `/ready`
- Hardcoded API URL in frontend -> environment variable
- Store JWT in localStorage -> memory + httpOnly refresh cookie
- Retry 4xx -> only retry 5xx
- Upload large files through API server -> presigned upload
- Duplicate frontend/backend types -> shared types, tRPC, or OpenAPI codegen

## Common Issues

Issue 1: Where does this business rule go?

- HTTP concerns -> controller
- Business decisions -> service
- Data access -> repository

Issue 2: Service is getting too big

- Split by sub-domain/workflow (e.g., creation, fulfillment, query services)

Issue 3: Tests are slow because they hit the database

- Unit tests mock repositories
- Integration tests use real DB/test containers or rollback strategy

## Reference Documents

- Backend testing strategy: [references/testing-strategy.md](references/testing-strategy.md)
- Release validation checklist: [references/release-checklist.md](references/release-checklist.md)
- Technology selection guide: [references/technology-selection.md](references/technology-selection.md)
- Django/DRF best practices: [references/django-best-practices.md](references/django-best-practices.md)
- API design deep dive: [references/api-design.md](references/api-design.md)
- DB schema and migration guidance: [references/db-schema.md](references/db-schema.md)
- Auth flow deep dive: [references/auth-flow.md](references/auth-flow.md)
- Environment management and CORS: [references/environment-management.md](references/environment-management.md)
