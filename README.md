# TaskFlow

A production-shaped task management system with authentication, relational data, a REST API, real-time updates, and a polished UI.

---

## 1. Overview

**TaskFlow** lets users register, log in, create projects, add tasks, and assign tasks to team members. The scope is intentionally constrained to ship something *complete* rather than something wide but shallow.

| Layer | Technology |
|---|---|
| Backend | Go 1.22 · Chi router · pgx/v5 · golang-migrate · slog |
| Frontend | React 18 · TypeScript · Vite · TanStack Query · Tailwind CSS v4 · Radix UI · dnd-kit |
| Database | PostgreSQL 16 |
| Infrastructure | Docker · docker-compose · multi-stage builds · nginx |

**What's shipped:**
- JWT authentication (register + login)
- Full Projects CRUD with pagination
- Full Tasks CRUD with `?status=` and `?assignee=` filters and pagination
- `GET /projects/:id/stats` — task counts by status and by assignee
- Assignee dropdown with user resolution (names, not raw UUIDs)
- Drag-and-drop board view with optimistic status updates
- Real-time task updates via SSE — no polling, no page refresh required
- Dark mode persisted in `localStorage`
- Responsive layout at 375 px and 1280 px
- 5 integration tests against a real Postgres instance (testcontainers)

---

## 2. Architecture Decisions

### Backend

**Chi over Gin/Echo.** Chi is stdlib-compatible — its middleware signature is `func(http.Handler) http.Handler`, which means any standard Go middleware works without adapters. It is also lighter than Gin with no reflection-based routing magic.

**pgx/v5 over database/sql + an ORM.** The assignment explicitly forbids auto-migrate/ORM schema management. Raw SQL with pgx gives full control over queries, avoids hidden N+1 patterns, and makes every database interaction reviewable. The tradeoff is verbosity; the benefit is no hidden behaviour.

**golang-migrate with embed.FS.** Migrations are embedded directly into the binary via `//go:embed`. The server binary is self-contained — no separate migration runner, no manual step. On every startup it runs pending migrations and seed data (idempotent via `ON CONFLICT DO NOTHING`).

**Shared `internal/httputil` package.** `WriteJSON`, `WriteError`, and `WriteValidationError` live in one place and are imported by every handler package. This avoids the copy-paste trap common in Go HTTP handlers.

**SSE over WebSockets for real-time.** SSE is unidirectional (server → client), which is all that's needed here — clients push changes via REST, the server fans out the result to all subscribers. SSE runs over plain HTTP/1.1, requires no upgrade handshake, and reconnects automatically. The hub is a goroutine-safe pub/sub registry keyed by project ID. Because `EventSource` in browsers cannot set custom headers, the JWT is passed as a `?token=` query parameter; the auth middleware accepts both.

**slog (stdlib).** Structured JSON output, zero dependencies, ships with Go 1.21+.

**Graceful shutdown.** The server listens for `SIGTERM`/`SIGINT`, drains in-flight requests with a 10-second deadline, and closes the connection pool cleanly. This matters in Docker where `docker stop` sends SIGTERM before SIGKILL.

**401 vs 403 are distinct.** Missing/invalid token → 401. Valid token, wrong permissions → 403. These are never conflated.

**Authorization model.** Project create/update/delete requires ownership. Task delete requires project ownership. Task update is open to any authenticated user who is the project owner or an assignee on that project — consistent with how collaborative tools like Linear and Asana work.

### Frontend

**TanStack Query for server state.** Consistent loading/error states, automatic cache invalidation, and optimistic updates with automatic rollback on error. Task status changes on both the list view (cycling pill) and board view (drag-and-drop) update the UI instantly and revert on server error.

**Radix UI primitives, not a component library black box.** Components are built on Radix headless primitives (Dialog, Select, Toast) with Tailwind utility classes. The bundle stays small and every component is readable and modifiable without fighting library internals.

**Auth state in localStorage + React Context.** JWT and user object persist across page refreshes. An axios interceptor attaches `Authorization` headers automatically and redirects to `/login` on any 401.

**URL search params for view state.** The board/list toggle is stored in `?view=board` so the preference survives page refresh — `useState` alone would reset on reload.

**Dark mode.** Implemented with Tailwind v4's `@custom-variant dark (&:where(.dark, .dark *))` and a class toggle on `<html>`. Preference persists in `localStorage` and defaults to system preference on first visit.

### Data model notes

- `id` columns are `TEXT` rather than the native `UUID` type. UUIDs are generated in Go using `github.com/google/uuid`. This avoids a runtime dependency on the `uuid-ossp` extension while keeping the IDs semantically correct.
- Indexes: `users(email)`, `projects(owner_id)`, `tasks(project_id)`, `tasks(assignee_id)`, `tasks(status)`, and a composite `tasks(project_id, status)` for the common filtered-list query.

---

## 3. Running Locally

**Prerequisites:** Docker and Docker Compose (nothing else required).

```bash
git clone https://github.com/rishabhsharma-go/Greening-India-Assingment
cd taskflow
cp .env.example .env
docker compose up --build
```

The app will be available at **http://localhost:3000**.

- Backend API: http://localhost:8080
- Database migrations and seed data run automatically on first startup.

To stop:
```bash
docker compose down
```

To reset the database:
```bash
docker compose down -v   # -v removes the postgres_data volume
docker compose up --build
```

---

## 4. Running Migrations

Migrations run **automatically** when the backend container starts. No manual step is required.

The backend embeds all SQL migration files at compile time (via Go's `embed.FS`) and runs `golang-migrate` against the database before the HTTP server starts accepting connections. Seed data (migration `000002`) is applied the same way, idempotently.

If you need to inspect or run migrations manually:
```bash
# Install golang-migrate CLI
brew install golang-migrate

# Run up
migrate -path ./backend/migrations -database "postgres://taskflow:taskflow_secret@localhost:5432/taskflow?sslmode=disable" up

# Roll back one step
migrate -path ./backend/migrations -database "postgres://taskflow:taskflow_secret@localhost:5432/taskflow?sslmode=disable" down 1
```

---

## 5. Test Credentials

Seed data is applied automatically on first startup.

```
Email:    test@example.com
Password: password123
```

A second user is also seeded (for testing task assignment):
```
Email:    jane@example.com
Password: password123
```

Seeded project: **Website Redesign** with 3 tasks across all three statuses (todo, in\_progress, done).

---

## 6. API Reference

All non-auth endpoints require `Authorization: Bearer <token>`.

### Auth

```
POST /auth/register
Body: { "name": "Jane", "email": "jane@example.com", "password": "secret123" }
201:  { "token": "<jwt>", "user": { "id", "name", "email", "created_at" } }

POST /auth/login
Body: { "email": "jane@example.com", "password": "secret123" }
200:  { "token": "<jwt>", "user": { ... } }
```

### Projects

```
GET    /projects?page=1&limit=20    → 200 { "projects": [...], "total": N, "limit": N }
POST   /projects                    → 201 Project
GET    /projects/:id                → 200 Project + tasks[]
PATCH  /projects/:id                → 200 Project          (owner only)
DELETE /projects/:id                → 204                  (owner only, cascades to tasks)
GET    /projects/:id/stats          → 200 { "by_status": {...}, "by_assignee": [...] }
```

### Tasks

```
GET    /projects/:id/tasks?status=&assignee=&page=1&limit=50  → 200 { "tasks": [...], "total": N }
POST   /projects/:id/tasks                                     → 201 Task
PATCH  /tasks/:id                                              → 200 Task
DELETE /tasks/:id                                              → 204  (project owner or task creator)
```

### Users

```
GET    /users                    → 200 { "users": [...] }         (for assignee dropdown)
GET    /users/resolve?ids=a,b,c  → 200 { "users": [...] }         (name resolution)
```

### Real-time (SSE)

```
GET    /projects/:id/events?token=<jwt>   → text/event-stream
```

Events: `task.created`, `task.updated`, `task.deleted` — each carries the full task payload (or `{"id": "..."}` for delete).

### Error shape

```json
{ "error": "validation failed", "fields": { "email": "is required" } }  // 400
{ "error": "unauthorized" }   // 401
{ "error": "forbidden" }      // 403
{ "error": "not found" }      // 404
```

---

## 7. What I'd Do With More Time

**Refresh tokens.** Current JWTs expire after 24 hours and cannot be revoked. A proper token pair (short-lived access + long-lived refresh stored in an `httpOnly` cookie) would address both issues.

**Rate limiting on auth endpoints.** `/auth/login` and `/auth/register` are not rate-limited. A simple in-memory token bucket (or Redis-backed for multi-instance deployments) on these endpoints is a minimal but meaningful protection against brute force.

**Cursor-based pagination.** The list endpoints use `LIMIT/OFFSET`. Offset pagination degrades under concurrent inserts — items can shift between pages. Cursor-based pagination using `created_at + id` as the cursor would be stable and performant at scale.

**E2E failure-path tests.** Integration tests cover the happy path. Adding failure-path tests (bad credentials, network errors, duplicate project names) and visual regression snapshots would give higher confidence before shipping.
