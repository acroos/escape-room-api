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
```

### Run the development server

```bash
npm run dev
```

### Available scripts

| Script                 | Description                      |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start Next.js development server |
| `npm run build`        | Build for production             |
| `npm run start`        | Start production server          |
| `npm run lint`         | Run ESLint                       |
| `npm run format`       | Format code with Prettier        |
| `npm run format:check` | Check formatting (CI)            |
| `npm run typecheck`    | Run TypeScript type checking     |
| `npm test`             | Run tests with Jest              |

### Environment variables

| Variable       | Description                | Default (local)                                             |
| -------------- | -------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string | `postgresql://postgres:postgres@localhost:5432/escape_room` |
| `REDIS_URL`    | Redis connection string    | `redis://localhost:6379`                                    |

All env vars are validated at startup via `lib/config.ts`. If any are missing, the app will throw immediately with a clear error message.

## Project Structure

```
escape-room-api/
├── .github/workflows/ci.yml   # CI pipeline (format, lint, typecheck, test)
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   ├── globals.css
│   └── page.module.css
├── lib/
│   └── config.ts              # Typed env config (validates + exports all env vars)
├── plans/
│   ├── escape-room-api.md     # Implementation plan
│   └── prompts.md             # Prompt log
├── docker-compose.yml         # Postgres + Redis for local development
├── .env.template              # Template for env vars (committed)
├── .env.local                 # Local env vars (gitignored)
├── .prettierrc                # Prettier config
├── .prettierignore
├── eslint.config.mjs          # ESLint config (Next.js + Prettier)
├── jest.config.ts             # Jest config (via next/jest)
├── next.config.ts
├── tsconfig.json
└── package.json
```

## API

_No API routes implemented yet. See [plans/escape-room-api.md](plans/escape-room-api.md) for the full API design._

## Data Models

_No data models implemented yet. See [plans/escape-room-api.md](plans/escape-room-api.md) for the schema design._
