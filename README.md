# LineWatch TO

LineWatch TO is an unofficial TTC reliability dashboard for Toronto subway and LRT riders. The goal is to combine live service alerts, planned closures, GTFS route data, saved commute checks, and historical alert snapshots into a map-first dashboard that quickly answers:

> Is my route affected now, later today, or this weekend?

The project is intentionally scoped as a full-stack portfolio build: practical enough to demo, but engineered with real backend, database, geospatial, cache, testing, and deployment concerns.

## Current Status

The current app is a polished frontend demo backed by typed local fixtures. It is designed to resemble a transit operations dashboard inspired by subwaystatus.live while keeping the data shapes close to the future Spring API contract.

Implemented now:

- Dark, map-first Next.js dashboard.
- Edited SVG-backed subway/LRT network map from `frontend/public/assets/linewatch/ttc-subway-map-edited.svg`.
- TTC-style line colors for Lines 1, 2, 4, and 5.
- Red suspended-service overlays.
- Orange delay overlays.
- Clickable/tappable affected map segments.
- Active alert cards with affected segments and shuttle indicators.
- Planned closure cards with map preview highlighting.
- Legend SVG icons for Lines 1, 2, 4, 5, and 6.
- Saved commute impact cards.
- Reliability snapshot panel.
- Ingestion/system health panel in fixture mode.
- High-contrast display toggle.
- Motion/static-background toggle.
- Mobile bottom navigation.
- Backend Spring Boot health endpoint.
- Frontend fixture tests and backend health-controller test.

Not implemented yet:

- Live TTC service-alert ingestion.
- Static GTFS import.
- PostGIS transit geometry schema.
- Redis-backed live status cache.
- Backend `/api/map`, `/api/status`, `/api/alerts`, or commute-impact endpoints.
- Real historical reliability aggregation.
- Deployment.

The UI currently demonstrates the intended product behavior with realistic local data. Backend-backed live data will be added incrementally.

## Stack

Frontend:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Node built-in test runner for fixture tests.

Backend:

- Java 21.
- Spring Boot.
- Maven.
- Spring Web.
- Spring Data JPA.
- Spring Data Redis.
- Bean Validation.
- Flyway.

Data and infrastructure:

- PostgreSQL with PostGIS.
- Redis.
- Docker Compose.

## Repository Layout

```text
backend/   Spring Boot API, ingestion services, and backend tests
frontend/  Next.js dashboard, typed fixtures, UI, and frontend checks
docs/      design specs and implementation plans
```

Important project guidance files:

```text
AGENTS.md  Agent operating guide for Codex, antigravity-cli, and similar tools
GEMINI.md  Copy of AGENTS.md for Gemini-style agent tooling
```

## Local Setup

Install frontend dependencies:

```bash
npm --prefix frontend install
```

Copy the example environment file if you plan to run local infrastructure:

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

## Frontend

Run the dashboard:

```bash
npm --prefix frontend run dev
```

Then open:

```text
http://localhost:3000
```

Run frontend checks:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Fixture data lives in:

```text
frontend/src/app/linewatch-data.ts
```

Map assets live in:

```text
frontend/public/assets/linewatch/
```

The edited map is loaded as the base visual layer. React renders disruption and planned-closure overlays above it using the same SVG coordinate system.

The current fixture test lives in:

```text
frontend/tests/linewatch-data.test.mjs
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

Current backend scope:

- `GET /api/health`

Planned backend API:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | Current line health, active alerts, and last refresh time. |
| `GET` | `/api/map` | Stations, line segments, and active disruption overlays. |
| `GET` | `/api/alerts?type=live\|planned` | Normalized live disruptions or planned closures. |
| `GET` | `/api/stations?query={q}` | Station search/autocomplete. |
| `POST` | `/api/commutes/impact` | Return impact summary for an origin/destination pair. |
| `GET` | `/api/reliability/lines` | Line-level disruption frequency and duration summaries. |
| `GET` | `/api/reliability/stations/{id}` | Station-specific alert history and reliability summary. |
| `GET` | `/api/health/ingestion` | Poll age, run status, record counts, and failure counts. |

## Product Scope

Core v1 target:

- Live subway/LRT status map.
- Red/orange disruption overlays on affected line segments.
- Clickable/tappable alert segments.
- Planned closure timeline for today, this weekend, and upcoming dates.
- Station and line search.
- Saved commute watchlists such as `Finch -> Union`.
- "Is my commute affected?" impact summary.
- Historical alert snapshots stored over time.
- Reliability summaries by line, station, and corridor.
- Ingestion health dashboard.
- Mobile-first responsive UI.
- High-contrast/accessibility mode.

Out of scope for v1:

- Full bus/streetcar map.
- Full trip planning.
- Fare calculation.
- Crowding prediction.
- Native mobile app.
- iOS/Android widgets.
- User accounts and passwords.
- Push or email notifications.

## Target Architecture

```text
TTC static GTFS feed
TTC real-time/service alert feed
Planned closure source
        |
        v
Spring Boot ingestion jobs
        |
        +--> GTFS importer
        +--> Alert poller
        +--> Alert normalizer/deduper
        +--> Segment/station impact matcher
        |
        v
PostgreSQL + PostGIS
        |
        +--> routes, stations, line shapes
        +--> normalized alerts
        +--> alert snapshots
        +--> reliability aggregates
        |
        v
Spring Boot REST API
        |
        +--> Redis live status cache
        +--> commute impact engine
        +--> ingestion health endpoints
        |
        v
Next.js dashboard
        |
        +--> live subway/LRT map
        +--> planned closure timeline
        +--> saved commute cards
        +--> reliability explorer
```

## Data Source Guardrails

LineWatch TO should use public and source-linked data. It should also be honest about uncertainty:

- TTC alerts can be vague.
- Some alerts name broad corridors rather than exact station-to-station segments.
- Planned closure pages or feeds may change format.
- Segment inference may be imperfect.
- This app is unofficial and should not be treated as the sole source of truth for TTC service.

## Verification Baseline

Before claiming a frontend change is complete, run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

For substantial UI changes, also run:

```bash
npm --prefix frontend run build
```

Before claiming a backend change is complete, run:

```bash
mvn -f backend/pom.xml test
```

## Portfolio Story

LineWatch TO is intended to demonstrate:

- Java 21 and Spring Boot API design.
- PostgreSQL/PostGIS data modeling.
- Redis-backed live status caching.
- Scheduled ingestion jobs.
- GTFS parsing.
- Alert normalization and deduplication.
- Segment and station impact matching.
- Historical snapshots and reliability analytics.
- TypeScript and React frontend engineering.
- Map-first responsive UI design.
- Accessibility-oriented display controls.
- Docker Compose local infrastructure.
- CI-ready verification commands.

Suggested resume bullet once backend and live data are implemented:

> Engineered LineWatch TO, an unofficial TTC reliability dashboard using Java 21, Spring Boot, PostgreSQL/PostGIS, Redis, Next.js, and TypeScript to visualize live subway/LRT disruptions, planned closures, and saved commute impact across Toronto.

## Roadmap

1. Polish the fixture-backed frontend until desktop and mobile screenshots are portfolio-ready.
2. Add browser smoke tests for the primary dashboard once a browser test dependency is accepted.
3. Add Flyway migrations for lines, stations, line segments, alert events, alert impacts, alert snapshots, saved commutes, and ingestion runs.
4. Seed or import subway/LRT geometry and expose `/api/map`.
5. Implement alert source clients and normalization.
6. Expose `/api/status` and `/api/alerts`.
7. Connect frontend data adapters to backend endpoints while retaining fixture mode.
8. Implement saved commute impact matching.
9. Add reliability aggregation and ingestion health endpoints.
10. Deploy and publish measured API/build/test metrics.

## License and Disclaimer

This is an unofficial commuter tool and portfolio project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission.
