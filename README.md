# Escape Room Reservation API

A reservation API for escape rooms built with Next.js 16, Postgres, and Redis.

## Quickstart

### Prerequisites

- Node.js 24 (see `.node-version`)
- npm
- Docker (for Postgres and Redis)

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.template .env.local

# Start Postgres and Redis
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed the database
npm run db:seed
```

### Run the development server

```bash
npm run dev
```

### Available scripts

| Script                     | Description                             |
| -------------------------- | --------------------------------------- |
| `npm run dev`              | Start Next.js development server        |
| `npm run build`            | Build for production                    |
| `npm run start`            | Start production server                 |
| `npm run lint`             | Run ESLint                              |
| `npm run format`           | Format code with Prettier               |
| `npm run format:check`     | Check formatting (CI)                   |
| `npm run typecheck`        | Run TypeScript type checking            |
| `npm test`                 | Run unit tests                          |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run test:all`         | Run all tests                           |
| `npm run db:generate`      | Generate Drizzle migration files        |
| `npm run db:migrate`       | Apply migrations to database            |
| `npm run db:seed`          | Seed database (truncates first)         |
| `npm run db:studio`        | Open Drizzle Studio GUI                 |

### Environment variables

| Variable            | Description                | Default (local)                                 |
| ------------------- | -------------------------- | ----------------------------------------------- |
| `POSTGRES_URL`      | Postgres connection string | `postgresql://postgres:postgres@localhost:5432` |
| `POSTGRES_DATABASE` | Postgres database name     | `escape_room`                                   |
| `REDIS_URL`         | Redis connection string    | `redis://localhost:6379`                        |

All env vars are validated at startup via `lib/config.ts`. If any are missing, the app will throw immediately with a clear error message.

## Project Structure

```
escape-room-api/
├── .github/workflows/ci.yml        # CI pipeline (format, lint, typecheck, test)
├── app/
│   ├── api/reservations/            # PRESENTATION LAYER
│   │   ├── [room_id]/[timeslot]/route.ts   # GET  — check hold status
│   │   ├── hold/route.ts                   # POST — place a hold
│   │   ├── confirm/route.ts                # POST — confirm reservation
│   │   └── release/route.ts                # POST — release hold
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── config.ts                    # Typed env config (validates + exports all env vars)
│   ├── db/                          # STORAGE LAYER (Postgres)
│   │   ├── index.ts                 # Drizzle client
│   │   ├── schema.ts                # rooms + reservations tables
│   │   ├── seed.ts                  # Seed script (truncates + inserts sample data)
│   │   └── repositories/
│   │       ├── rooms.ts             # findById
│   │       └── reservations.ts      # findByRoomAndTimeslot, create
│   ├── redis/                       # STORAGE LAYER (Redis)
│   │   ├── index.ts                 # ioredis client
│   │   └── holds.ts                 # setHold, getHold, deleteHold, extendHold (Lua)
│   └── reservations/                # BUSINESS LOGIC LAYER
│       └── service.ts               # holdRoom, getHold, releaseHold, confirmReservation
├── __tests__/
│   ├── unit/                        # Mocked tests (no Docker needed)
│   │   ├── validation.test.ts
│   │   └── reservation-service.test.ts
│   └── integration/                 # Full-stack tests (requires Docker)
│       └── reservations.test.ts
├── drizzle/                         # Generated migration files
├── plans/
│   ├── escape-room-api.md
│   └── prompts.md
├── docker-compose.yml
├── drizzle.config.ts
├── .env.template
├── .prettierrc
├── eslint.config.mjs
├── jest.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

## API

All endpoints are under `/api/reservations`. The `x-reservation-code` header is used for lightweight auth on get/confirm/release.

### POST /api/reservations/hold

Place a 5-minute hold on a room/timeslot.

```bash
curl -X POST http://localhost:3000/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d '{"room_id": "<ROOM_UUID>", "timeslot": 1780333200000}'
```

**Responses**: `201` with `{ reservation_code }` | `400` (invalid timeslot or room) | `409` (already held or confirmed)

> **Note**: `timeslot` is milliseconds from epoch and must be divisible by 3,600,000 (on the hour).

### GET /api/reservations/:room_id/:timeslot

Check hold status and remaining TTL.

```bash
curl http://localhost:3000/api/reservations/<ROOM_UUID>/1780333200000 \
  -H "x-reservation-code: <CODE>"
```

**Responses**: `200` with `{ ttl }` | `403` (wrong code) | `404` (no hold)

### POST /api/reservations/confirm

Confirm a held reservation (persists to Postgres).

```bash
curl -X POST http://localhost:3000/api/reservations/confirm \
  -H "Content-Type: application/json" \
  -H "x-reservation-code: <CODE>" \
  -d '{"room_id": "<ROOM_UUID>", "timeslot": 1780333200000, "email": "user@example.com", "full_name": "Jane Doe"}'
```

**Responses**: `201` with `{ reservation_id }` | `403` (wrong code or expired)

### POST /api/reservations/release

Release a hold.

```bash
curl -X POST http://localhost:3000/api/reservations/release \
  -H "Content-Type: application/json" \
  -H "x-reservation-code: <CODE>" \
  -d '{"room_id": "<ROOM_UUID>", "timeslot": 1780333200000}'
```

**Responses**: `200` with `{ success: true }` | `403` (wrong code)

## Data Models

### rooms

| Column       | Type                     | Notes                           |
| ------------ | ------------------------ | ------------------------------- |
| `id`         | uuid                     | PK, default `gen_random_uuid()` |
| `name`       | text                     | not null                        |
| `created_at` | timestamp with time zone | default `now()`, not null       |

### reservations

| Column       | Type                     | Notes                           |
| ------------ | ------------------------ | ------------------------------- |
| `id`         | uuid                     | PK, default `gen_random_uuid()` |
| `room_id`    | uuid                     | FK → rooms.id, not null         |
| `timeslot`   | timestamp with time zone | not null                        |
| `email`      | text                     | not null                        |
| `full_name`  | text                     | not null                        |
| `created_at` | timestamp with time zone | default `now()`, not null       |

**Unique constraint**: `room_timeslot_unique` on `(room_id, timeslot)` — one reservation per room per timeslot.

### Redis keys

| Pattern                          | Value            | TTL                                  |
| -------------------------------- | ---------------- | ------------------------------------ |
| `room:{room_id}:{epoch-seconds}` | reservation code | 300s (hold), 15s (confirm extension) |
