# LineWatchTO Project Foundation Design

Date: 2026-05-30

## Purpose

LineWatchTO is an unofficial TTC reliability dashboard. The app combines static GTFS route data, live service alerts, planned closures, saved commute checks, and historical alert snapshots so Toronto riders can quickly see whether subway/LRT trips are affected now, later today, or this weekend.

This repository foundation establishes the monorepo shape, baseline backend/frontend apps, local infrastructure, and initial documentation for the full implementation.

## Product Scope

The first production version focuses on subway/LRT only. It should show a live line-status map, planned closure timeline, station search, saved commute impact cards, and reliability summaries by line, station, and corridor.

Do not build full TTC trip planning, full bus/streetcar maps, native mobile apps, user accounts, or push notifications in v1.

## Architecture

The project is a monorepo with:

- `backend/`: Java 21 Spring Boot API and ingestion service.
- `frontend/`: Next.js App Router dashboard.
- `docker-compose.yml`: local PostgreSQL/PostGIS and Redis.
- `docs/`: implementation specs, plans, and architecture notes.

The backend will own GTFS ingestion, alert polling, normalization, deduplication, commute-impact matching, reliability analytics, and API responses. The frontend will render the live map, timeline, commute cards, and reliability explorer.

## Initial API Contract

The scaffold includes a health endpoint first:

- `GET /api/health`: returns service name and status.

Future API surface:

- `GET /api/status`
- `GET /api/map`
- `GET /api/alerts?type=live|planned`
- `GET /api/stations?query={q}`
- `POST /api/commutes/impact`
- `GET /api/reliability/lines`
- `GET /api/health/ingestion`

## Data Model Direction

The first database migrations will eventually create:

- `transit_lines`
- `stations`
- `line_segments`
- `alert_events`
- `alert_impacts`
- `alert_snapshots`
- `saved_commutes`
- `ingestion_runs`

The foundation scaffold only creates the application structure and leaves domain migrations for the first implementation phase.

## Testing Strategy

Start with a backend health-controller test so the scaffold has a real automated baseline. Add frontend typecheck and lint scripts from the start. Add Playwright smoke tests when the first real UI flow exists.

## GitHub Repository

The local repo should be initialized at `~/dev/ttc-reliability-navigator`. The intended GitHub repository name is `ttc-reliability-navigator`. The user-facing product name remains `LineWatchTO`.
