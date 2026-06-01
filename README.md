# LineWatch TO

LineWatch TO is an unofficial TTC reliability dashboard for Toronto subway and LRT riders. The goal is to combine live service alerts, planned closures, GTFS route data, saved commute checks, and historical alert snapshots into a map-first dashboard that quickly answers:

> Is my route affected now, later today, or this weekend?

The project is intentionally scoped as a full-stack portfolio build: practical enough to demo, but engineered with real backend, database, geospatial, cache, testing, and deployment concerns.

## Current Status

The current app is a seeded full-stack dashboard demo with a graceful local-fixture fallback. Next.js fetches seeded Spring Boot dashboard boundaries on initial render when the backend is available and falls back to typed local fixtures when any required dashboard request fails. The backend can now poll and normalize the official TTC Live Alerts feed when explicitly enabled, but the visible dashboard APIs still return demo data until the next live-mode slice.

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
- Clickable/tappable station detail overlays for supported rapid transit stations.
- Backend `/api/stations` and `/api/stations/{id}` endpoints backed by Flyway-seeded PostgreSQL station data.
- Station detail panel with desktop right dock and mobile bottom sheet behavior.
- Seeded station access and station impact records.
- Demo station arrivals clearly labeled as placeholders, not live TTC predictions.
- PostGIS-enabled Flyway schema for stations, transit lines, line segments, alerts, alert-segment links, snapshots, and ingestion runs.
- Seeded `/api/map`, `/api/status`, and `/api/alerts?type=live|planned` demo boundaries.
- Next.js Server Component dashboard loading with complete local-fixture fallback.
- Playwright Chromium smoke tests for seeded API and fallback rendering on desktop and mobile viewports.
- Opt-in scheduled polling for the official TTC Live Alerts feed at `https://alerts.ttc.ca/api/alerts/live-alerts`.
- Raw staging for route and accessibility source records so unsupported records are retained for later analysis.
- Normalization and source-ID upserts for supported subway/LRT delays, suspensions, and planned closures.
- Elevator and escalator outage normalization with station links where TTC station names resolve.
- Alert snapshots for new, changed, deactivated, and reactivated normalized route alerts.
- Durable ingestion-run tracking and `/api/health/ingestion`.

Not implemented yet:

- Static GTFS import.
- Populated geographic segment geometry for PostGIS intersect logic.
- User-facing live-mode reads for `/api/alerts`, `/api/status`, station detail, and map overlays.
- Live TTC station-arrival predictions. Station times remain clearly labeled demo estimates.
- Production alert-to-segment matching.
- Redis-backed live status cache.
- Backend commute-impact endpoint.
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
npm --prefix frontend run test:smoke
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

Alert ingestion is disabled by default. Enable one scheduled poller process with:

```bash
LINEWATCH_INGESTION_ALERTS_ENABLED=true \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT2M \
mvn -f backend/pom.xml spring-boot:run
```

Inspect its latest poll result:

```bash
curl http://localhost:8080/api/health/ingestion
```

Current backend scope:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend service health. |
| `GET` | `/api/health/ingestion` | Latest TTC Live Alerts poll status and record counts. |
| `GET` | `/api/map` | Seeded stations and SVG-backed line segments. |
| `GET` | `/api/status` | Seeded line status demo payload. |
| `GET` | `/api/alerts?type=live\|planned` | Hard-coded live-style or planned demo alerts. |
| `GET` | `/api/stations?query={q}` | Seeded station summaries and search. |
| `GET` | `/api/stations/{id}` | Seeded station detail payload. |

Planned backend API:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/commutes/impact` | Return impact summary for an origin/destination pair. |
| `GET` | `/api/reliability/lines` | Line-level disruption frequency and duration summaries. |
| `GET` | `/api/reliability/stations/{id}` | Station-specific alert history and reliability summary. |

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

- The implemented poller reads the public TTC Live Alerts endpoint at `https://alerts.ttc.ca/api/alerts/live-alerts`.
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
npm --prefix frontend run test:smoke
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

1. Switch user-facing alert, status, station-outage, and map-overlay reads onto normalized TTC records while retaining fixture mode for demos and tests.
2. Add a public live-arrival provider and replace station-panel demo estimates with source-labeled predictions.
3. Import static GTFS shapes and implement production alert-to-segment matching.
4. Implement saved commute impact matching and reliability aggregation.
5. Deploy and publish measured API/build/test metrics.

## License and Disclaimer

This is an unofficial commuter tool and portfolio project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission.
