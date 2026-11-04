# Nodus Backend

Backend for Nodus, a team communication app. Users create workspaces, invite
members, and talk in channels and one-to-one direct conversations. The backend
also provides announcements (immediate or scheduled), notifications, read
receipts, presence statuses, message search, and workspace metrics for Owners
and Admins.

It exposes a REST API and a Socket.IO realtime API. PostgreSQL is the source of
truth; Socket.IO only delivers committed changes.

## Tech stack

- **Runtime:** Node.js 24, TypeScript (strict), ES modules
- **HTTP:** Express 5, Zod validation, Helmet, CORS, express-rate-limit
- **Database:** PostgreSQL with Prisma ORM 7 (`@prisma/adapter-pg`)
- **Realtime:** Socket.IO, with Redis pub/sub between API processes
- **Background jobs:** BullMQ on Redis (scheduled announcements)
- **Auth:** JWT access and refresh tokens with rotation, Argon2id password
  hashing
- **Logging:** pino
- **Tests:** Vitest, Supertest, socket.io-client
- **API docs:** OpenAPI 3 (Swagger UI) and AsyncAPI 3

## Project structure

```text
src/
  modules/      feature modules: routes → controller → service → repository
  socket/       Socket.IO setup, rooms, publisher, Redis bridge
  queues/       BullMQ queues
  workers/      announcement worker (in-process and standalone)
  config/       env validation, logger, OpenAPI and AsyncAPI documents
  middleware/   auth, validation, errors
prisma/         schema and migrations
tests/          unit and integration tests
```

## Getting started

### Prerequisites

- Node.js 24 and npm 11
- PostgreSQL and Redis
- Docker (only for the integration test database)

### Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`: `DATABASE_URL`, `REDIS_URL`, and two different
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` values (at least 32 characters). The
command to generate a secret is in `.env.example`.

Apply the database migrations:

```bash
npm run prisma:deploy
```

### Run

```bash
npm run dev        # development server with reload, http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

The API server also runs the announcement worker. To run the worker as a
separate process, use `npm run start:announcements-worker`.

In development, the API docs are available at:

- `/api/docs`: REST API (Swagger UI)
- `/api/async-docs`: Socket.IO API (AsyncAPI)

## Tests

Unit tests need no services:

```bash
npm run test:unit
```

Integration tests use a separate PostgreSQL and Redis from
`docker-compose.test.yml`:

```bash
cp .env.test.example .env.test   # then set the passwords and secrets
docker compose -f docker-compose.test.yml --env-file .env.test up -d --wait
npm run test:integration
```

The test scripts refuse to run against a database whose name does not end in
`_test`.

Other checks:

```bash
npm run typecheck
npm run test:types
npm run format:check
```
