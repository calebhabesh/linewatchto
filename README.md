# LineWatch TO

LineWatch TO is an unofficial TTC reliability dashboard for Toronto commuters. The project will combine TTC GTFS data, live service alerts, planned closures, saved commute checks, and historical alert snapshots to show whether subway/LRT trips are affected now, later today, or this weekend.

The repository is intentionally scoped as a full-stack portfolio project: practical enough to demo, but engineered with real backend, database, geospatial, cache, testing, and deployment concerns.

## Stack

- Backend: Java 21, Spring Boot, Maven.
- Database: PostgreSQL with PostGIS.
- Cache: Redis.
- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Infrastructure: Docker Compose.

## Repository Layout

```text
backend/   Spring Boot API and ingestion services
frontend/  Next.js dashboard
docs/      design specs and implementation plans
```

## Local Infrastructure

Copy the example environment file:

```bash
cp .env.example .env
```

Start PostgreSQL/PostGIS and Redis:

```bash
docker compose up -d postgres redis
```

Stop local services:

```bash
docker compose down
```

## Backend

Run backend tests:

```bash
mvn -f backend/pom.xml test
```

Start the backend:

```bash
mvn -f backend/pom.xml spring-boot:run
```

Health endpoint:

```bash
curl http://localhost:8080/api/health
```

## Frontend

Install dependencies:

```bash
npm --prefix frontend install
```

Run checks:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Start the frontend:

```bash
npm --prefix frontend run dev
```

## Current Scope

The first implementation phase will build:

- Static TTC GTFS import for subway/LRT routes, stations, and line shapes.
- Live alert normalization and storage.
- Planned closure timeline.
- Saved commute impact checks.
- Reliability analytics from alert snapshots.
