# Escape Room Reservation API - Implementation Plan

## Overview

Build a reservation API for escape rooms using Next.js 16 App Router route handlers, Postgres (Drizzle ORM), and Redis (ioredis). The API supports placing temporary holds on rooms (5-min TTL via Redis), confirming reservations (persisted to Postgres), and releasing holds. A reservation code (`crypto.randomUUID()`) serves as lightweight auth.

## Data Models

### `rooms` table

| Column     | Type      | Notes                           |
| ---------- | --------- | ------------------------------- |
| id         | uuid      | PK, default `gen_random_uuid()` |
| name       | text      | not null                        |
| created_at | timestamp | default `now()`                 |

### `reservations` table

| Column     | Type      | Notes                           |
| ---------- | --------- | ------------------------------- |
| id         | uuid      | PK, default `gen_random_uuid()` |
| room_id    | uuid      | FK → rooms.id, not null         |
| timeslot   | timestamp | not null                        |
| email      | text      | not null                        |
| full_name  | text      | not null                        |
| created_at | timestamp | default `now()`                 |

**Unique constraint**: `(room_id, timeslot)` — a room can only have one confirmed reservation per timeslot.

### Redis keys

- Pattern: `room:{room_id}:{ISO-timestamp}`
- Value: reservation code (UUID)
- TTL: 300 seconds (5 minutes) on hold, 15 seconds on confirm (extended just long enough for Postgres write)

## Architecture

Three-layer separation:

```
┌─────────────────────────────────────────────────────┐
│  Presentation Layer (route handlers)                │
│  app/api/reservations/*/route.ts                    │
│  - Parse HTTP requests (body, headers, params)      │
│  - Call service layer                               │
│  - Map service results to HTTP responses            │
│  - No business logic, no direct storage access      │
├─────────────────────────────────────────────────────┤
│  Business Logic Layer (service)                     │
│  lib/reservations/service.ts                        │
│  - Orchestrates storage calls                       │
│  - Validates business rules (timeslot on the hour,  │
│    room exists, code matches, slot not confirmed)   │
│  - Returns typed results (not HTTP responses)       │
│  - No HTTP concepts, no direct Redis/SQL commands   │
├─────────────────────────────────────────────────────┤
│  Storage/Integration Layer (repositories)           │
│  lib/db/repositories/rooms.ts                       │
│  lib/db/repositories/reservations.ts                │
│  lib/redis/holds.ts                                 │
│  - Raw data access: queries, SET/GET/DEL, Lua       │
│  - No business rules, no HTTP concepts              │
│  - Thin wrappers over Drizzle and ioredis           │
└─────────────────────────────────────────────────────┘
```

## API Routes (Next.js App Router)

| Method | Path                                     | Route File                                           |
| ------ | ---------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/reservations/[room_id]/[timeslot]` | `app/api/reservations/[room_id]/[timeslot]/route.ts` |
| POST   | `/api/reservations/hold`                 | `app/api/reservations/hold/route.ts`                 |
| POST   | `/api/reservations/confirm`              | `app/api/reservations/confirm/route.ts`              |
| POST   | `/api/reservations/release`              | `app/api/reservations/release/route.ts`              |

## PR Breakdown

---

### PR 1: Tooling & CI Setup

**Branch**: `tooling-ci-setup`

**What**:

- Install and configure **Prettier** (`.prettierrc`, `.prettierignore`)
- Update **ESLint** config (extend with prettier plugin to avoid conflicts)
- Install and configure **Jest** + `ts-jest` (or `@swc/jest`) with `jest.config.ts`
- Add npm scripts: `format`, `format:check`, `lint`, `typecheck`, `test`
- Create GitHub Actions workflow (`.github/workflows/ci.yml`) with jobs for: format check, lint, typecheck, test
- Format existing codebase with Prettier

**README updates**: Quickstart section with available scripts

**Reviewability**: Pure tooling — no business logic, easy to verify configs are correct.

---

### PR 2: Docker Compose & Environment Setup

**Branch**: `docker-env-setup`

**What**:

- Create `docker-compose.yml` with:
  - **Postgres** service (port 5432)
  - **Redis** service (port 6379)
- Create `.env.template` with dummy values (committed)
- Create `.env.local` with real local values (gitignored)
- Env vars needed:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/escape_room`
  - `REDIS_URL=redis://localhost:6379`
- Install `dotenv` for loading `.env` files in scripts (seed, migrations, etc.)
- Create typed config module in `lib/config.ts`:
  - Reads and validates all required env vars at import time
  - Throws immediately with a clear message if any are missing
  - Exports a typed `config` object (e.g. `config.databaseUrl`, `config.redisUrl`)
  - All other modules import `config` instead of reading `process.env` directly

**README updates**: Quickstart updated with Docker instructions

**Reviewability**: Infrastructure + config — no business logic.

---

### PR 3: Database Schema, ORM & Seed Script

**Branch**: `database-schema`

**What**:

- Install `drizzle-orm`, `drizzle-kit`, `postgres` (the `postgres` driver for drizzle)
- Create Drizzle config (`drizzle.config.ts`)
- Define schema in `lib/db/schema.ts` (`rooms`, `reservations` tables)
- Create DB client in `lib/db/index.ts`
- Generate and run initial migration via `drizzle-kit`
- Add npm scripts: `db:generate`, `db:migrate`, `db:seed`
- Create seed script (`lib/db/seed.ts`) that:
  - Truncates all tables (clean slate)
  - Inserts 3-5 sample rooms
- Add decision record for choosing `postgres` driver over `node-postgres`

**README updates**: Data models section, seed instructions, updated project structure

**Reviewability**: Schema + ORM setup only. No API routes yet.

---

### PR 4: Storage Layer (Redis) & Business Logic Layer + Unit Tests

**Branch**: `redis-reservation-service`

**What**:

**Storage layer** — `lib/redis/`:
- Install `ioredis`
- Create Redis client in `lib/redis/index.ts`
- Create hold store in `lib/redis/holds.ts` — thin wrapper over ioredis, no business logic:
  - `setHold(key, code, ttlSeconds)` — `SET key code EX ttl NX`, returns success boolean
  - `getHold(key)` — `GET` + `TTL`, returns `{ code, ttl }` or null
  - `deleteHold(key)` — `DEL`
  - `extendHold(key, expectedCode, ttlSeconds)` — **Lua script** that atomically GETs, compares, re-SETs with new TTL. Returns success/failure
- Helper: `buildRedisKey(roomId, timeslot)` → `room:{roomId}:{timeslot}`

**Storage layer** — `lib/db/repositories/`:
- `rooms.ts` — `findById(roomId)`: looks up a room by ID
- `reservations.ts` — `findByRoomAndTimeslot(roomId, timeslot)`, `create(data)`: raw DB queries

**Business logic layer** — `lib/reservations/service.ts`:
- Depends on hold store + DB repositories (injected or imported), never on HTTP concepts
- `holdRoom(roomId, timeslot)` — validates timeslot on the hour, validates room exists, checks no confirmed reservation exists, calls `setHold()`, returns typed result (success w/ code, or error reason)
- `getHold(roomId, timeslot, code)` — fetches hold, compares code, returns `{ ttl }` or error reason
- `releaseHold(roomId, timeslot, code)` — fetches hold, compares code, calls `deleteHold()`
- `confirmReservation(roomId, timeslot, code, email, fullName)` — calls `extendHold()` (Lua), inserts reservation, calls `deleteHold()`, returns reservation ID or error reason
- `validateTimeslot(timeslot)` — checks minutes/seconds are 0
- Returns typed discriminated unions (e.g. `{ ok: true, code } | { ok: false, reason: 'already_held' | 'invalid_timeslot' | ... }`) — no HTTP status codes
- Add decision record for Lua script approach to atomic confirm

**Unit Tests** (`__tests__/unit/`):
- **Timeslot validation**: valid (on the hour), invalid (minutes/seconds not zero)
- **Redis key builder**: correct format
- **Service layer** (mock repositories + hold store):
  - `holdRoom`: success, already held, invalid timeslot, room not found, already confirmed
  - `getHold`: exists, doesn't exist, code mismatch
  - `releaseHold`: code matches, code mismatch
  - `confirmReservation`: code matches (Lua returns OK), code mismatch, hold expired

**README updates**: Updated project structure

**Reviewability**: Storage + business logic layers with unit tests. No HTTP concerns. Each layer can be reviewed and tested independently.

---

### PR 5: Presentation Layer (Route Handlers) + Integration Tests

**Branch**: `api-routes`

**What**:

Route handlers are thin — they parse HTTP inputs, call the service, and map results to responses. No business logic.

- **POST `/api/reservations/hold`**
  - Parse body: `{ room_id, timeslot }`
  - Call `service.holdRoom()` → map result to 400/409/201
- **GET `/api/reservations/[room_id]/[timeslot]`**
  - Read `x-reservation-code` header, parse params
  - Call `service.getHold()` → map result to 403/404/200
- **POST `/api/reservations/confirm`**
  - Read `x-reservation-code` header
  - Parse body: `{ room_id, timeslot, email, full_name }`
  - Call `service.confirmReservation()` → map result to 403/201
- **POST `/api/reservations/release`**
  - Read `x-reservation-code` header
  - Parse body: `{ room_id, timeslot }`
  - Call `service.releaseHold()` → map result to 403/200
- Update seed script if needed

**Integration Tests** (`__tests__/integration/`):
- Requires running Docker services (Postgres + Redis)
- **Hold flow**:
  - Hold a room → 201
  - Hold same room/timeslot → 409
  - Hold with invalid timeslot → 400
  - Hold with non-existent room → 400
- **Get hold**:
  - Get with valid code → 200 + TTL
  - Get with wrong code → 403
  - Get non-existent hold → 404
- **Confirm flow**:
  - Hold then confirm → 201 + reservation in DB
  - Confirm with wrong code → 403
  - Confirm expired hold → 403
  - Double confirm same slot → unique constraint error
- **Release flow**:
  - Hold then release → 200 + key deleted in Redis
  - Release with wrong code → 403
- **Race condition test**:
  - Hold a room, wait for TTL to be very low
  - Confirm (Lua script extends TTL)
  - Verify Postgres write completes
  - Verify another hold attempt during confirm window is rejected
- **Concurrent access**:
  - Two concurrent hold attempts on same room/timeslot → one succeeds, one fails

**README updates**: Full API documentation with CURL examples, testing instructions (unit vs integration), updated project structure

**Reviewability**: Route handlers are trivial mappers. Integration tests exercise the full stack end-to-end.

---

## Key Technical Decisions

| Decision                | Choice                                               | Reason                                                                          |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Redis locking           | `SET ... EX 300 NX`                                  | Atomic set-if-not-exists with TTL handles hold + expiry in one command          |
| Auth mechanism          | UUID reservation code in `x-reservation-code` header | Simple, hard to guess, adequate for demo                                        |
| Race condition handling | Lua script for atomic check-and-extend               | Prevents hold expiry between validation and Postgres write                      |
| Confirm TTL extension   | 15 seconds                                           | Long enough for Postgres write, short enough to not block others if write fails |
| Postgres driver         | `postgres` (porsager/postgres)                       | Recommended by Drizzle docs, lightweight                                        |
| Test runner             | Jest with ts-jest or @swc/jest                       | Per project requirements                                                        |

## File Structure (Final)

```
escape-room-api/
├── .github/workflows/ci.yml
├── app/                                          # PRESENTATION LAYER
│   └── api/reservations/
│       ├── [room_id]/[timeslot]/route.ts         #   GET  — parse params/header, call service, map to HTTP
│       ├── hold/route.ts                         #   POST — parse body, call service, map to HTTP
│       ├── confirm/route.ts                      #   POST — parse body/header, call service, map to HTTP
│       └── release/route.ts                      #   POST — parse body/header, call service, map to HTTP
├── lib/
│   ├── config.ts                                 # Typed env config — validates + exports all env vars
│   ├── reservations/                             # BUSINESS LOGIC LAYER
│   │   └── service.ts                            #   Orchestrates storage, validates rules, returns typed results
│   ├── db/                                       # STORAGE LAYER (Postgres)
│   │   ├── index.ts                              #   Drizzle client
│   │   ├── schema.ts                             #   rooms + reservations tables
│   │   ├── seed.ts                               #   Seed script
│   │   └── repositories/
│   │       ├── rooms.ts                          #   findById
│   │       └── reservations.ts                   #   findByRoomAndTimeslot, create
│   └── redis/                                    # STORAGE LAYER (Redis)
│       ├── index.ts                              #   ioredis client
│       └── holds.ts                              #   setHold, getHold, deleteHold, extendHold (Lua)
├── __tests__/
│   ├── unit/
│   │   ├── validation.test.ts
│   │   └── reservation-service.test.ts
│   └── integration/
│       └── reservations.test.ts
├── drizzle/                                      # Generated migrations
├── docs/decisions/                               # Decision records
├── plans/
│   ├── escape-room-api.md
│   └── prompts.md
├── docker-compose.yml
├── drizzle.config.ts
├── .env.template
├── .env.local                                    # gitignored
├── .prettierrc
├── .prettierignore
├── jest.config.ts
├── eslint.config.mjs
├── next.config.ts
├── tsconfig.json
├── package.json
└── README.md
```
