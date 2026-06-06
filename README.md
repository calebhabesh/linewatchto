# LineWatch TO

LineWatch TO is an unofficial TTC reliability dashboard for Toronto subway and LRT riders. The goal is to combine live service alerts, planned closures, GTFS route data, saved commute checks, and historical alert snapshots into a map-first dashboard that quickly answers:

> Is my route affected now, later today, or this weekend?

The project is intentionally scoped as a full-stack portfolio build: practical enough to demo, but engineered with real backend, database, geospatial, cache, testing, and deployment concerns.

## Current Status

The current app is a full-stack dashboard demo with graceful local-fixture fallback. Next.js fetches Spring Boot dashboard boundaries on initial render when the backend is available and falls back to typed local fixtures when any required dashboard request fails. The backend can poll and normalize the official TTC Live Alerts feed when explicitly enabled. User-facing alert, status, map-overlay, and station-detail dynamic reads use those normalized records only while the latest successful ingestion run is fresh; stale live rows are suppressed instead of remaining visible.

Implemented now:

- Dark, map-first Next.js dashboard.
- Overnight subway-closed screen that hides the feed during general non-operating hours while allowing a map peek for current overlays and station accessibility details.
- Edited SVG-backed subway/LRT network map from `frontend/public/assets/linewatch/ttc-subway-map-edited.svg`.
- TTC-style line colors for Lines 1, 2, 4, 5, and 6.
- Red suspended-service overlays.
- Orange ordinary-delay overlays with a static effect.
- Explicit Reduced Speed Zone overlays with directional chevrons.
- Separate Delays and Reduced Speed Zones submenu cards.
- Clickable/tappable affected map segments and single-station impact rings that open the corresponding submenu cards.
- Active alert cards with affected segments, shuttle indicators, Started timing, and Updated timing.
- Delay cards with Started based on `activePeriod.start` and Updated based on TTC `lastUpdated`.
- Reduced Speed Zone cards with Cause, Resolution, and available speed/track metadata.
- Planned closure cards with map preview highlighting.
- Legend SVG icons for Lines 1, 2, 4, 5, and 6.
- Account-backed saved commutes with weighted default rapid-transit route matching and dashboard-visible impact summaries.
- Account sign-in supports local/dev password reset through a reset-token flow; production email delivery is a future integration point.
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
- Reviewed line-specific wheelchair and elevator metadata for every mapped Line 1, 2, 4, 5, and 6 stop, including distinct Spadina Line 1 and Line 2 values.
- Authored wheelchair and elevator icons in station detail panels.
- Fresh directly linked TTC station alerts and elevator/escalator outage rows when ingestion is current.
- Source-labeled station arrivals using TTC scheduled service when a merged GTFS schedule import is active. They are timetable-based estimates, not live subway/LRT predictions. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data.
- PostGIS-enabled Flyway schema for stations, transit lines, line segments, alerts, alert-segment links, snapshots, and ingestion runs.
- Dashboard API boundaries for `/api/map`, `/api/status`, and `/api/alerts`, with fixture fallback when backend data is unavailable.
- Next.js Server Component dashboard loading with complete local-fixture fallback.
- Playwright Chromium smoke tests for seeded API, fallback rendering, delay overlay clicks, station-ring interactions, and station accessibility details on desktop and mobile viewports.
- Opt-in scheduled polling for the official TTC Live Alerts feed at `https://alerts.ttc.ca/api/alerts/live-alerts`.
- Raw staging for route and accessibility source records so unsupported records are retained for later analysis.
- Normalization and source-ID upserts for supported subway/LRT ordinary delays, suspensions, Reduced Speed Zones, and planned closures.
- Elevator and escalator outage normalization with station links where TTC station names resolve.
- Alert snapshots for new, changed, deactivated, and reactivated normalized route alerts.
- Durable ingestion-run tracking and `/api/health/ingestion`.
- Persisted route-alert impact kind so ordinary delays are not categorized as Reduced Speed Zones.
- Live Alerts reduced-speed records now derive explicit cardinal direction from TTC wording.
- `Both ways` alert directions are interpreted bidirectionally with line-aware cardinal labels.
- Stale successful ingestion runs no longer drive visible alert cards, line status, map overlays, or dynamic station detail rows after the dashboard freshness window expires.
- Map overlays expose layered impact metadata and project onto adjacent rapid-transit topology links.
- Ordinary overlay links resolve from SVG station-dot anchors.
- Nonlinear overlays resolve from the authored hidden segment-guides-layer.
- Opposite-direction Reduced Speed Zone records merge into one bidirectional effect and grouped card.
- Directionless Reduced Speed Zone records render bidirectionally without inventing a direction label.
- Nightly closure active-window gating so nightly overlays only appear during the actual active child-period windows.

Not implemented yet:

- TTC alert polling remains opt-in by default; use the live backend dev script for fresh alert cards and map overlays.
- GTFS import remains unimplemented.
- Populated geographic PostGIS geometry remains unimplemented.
- Production geospatial matching remains unimplemented.
- TTC Reduced Speed Zones webpage ingestion remains unimplemented.
- Station arrivals use source-labeled TTC scheduled service when a merged GTFS schedule import is active. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data.
- The arrival provider architecture supports live, scheduled, unavailable, and demo status states.
- Redis-backed live status cache.
- Standalone commute-impact endpoint, route review/edit, push/email commute notifications, alternate-route suggestions, and accessibility-personalized commute matching.
- Real historical reliability aggregation.
- Deployment.

The UI demonstrates the intended product behavior with realistic local data and an opt-in fresh-ingestion live alert path. Additional backend-backed live data will be added incrementally.

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

Start the backend with TTC Live Alerts polling enabled for live alert cards and map overlays:

```bash
scripts/dev-backend-live.sh
```

Health endpoint:

```bash
curl http://localhost:8080/api/health
```

Alert ingestion is disabled by default for offline-safe local runs, CI, and demos that should not depend on the TTC public API. The `scripts/dev-backend-live.sh` command runs the backend with the `dev-live` Spring profile, which enables one scheduled poller process.

Equivalent manual command:

```bash
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev-live
```

`LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE` controls how long a successful poll can drive visible dashboard data. The default is `PT10M`; when that window expires, `/api/status`, `/api/alerts`, and `/api/map` stop using old active alert rows.

Inspect its latest poll result:

```bash
curl http://localhost:8080/api/health/ingestion
```

### Optional Scheduled Arrival Import

Station arrivals use TTC scheduled service when a merged GTFS schedule import is active. Download the public TTC merged GTFS zip and import the rapid-transit subset:

```bash
node scripts/download-ttc-gtfs.mjs /tmp/ttc-merged-gtfs.zip
docker compose up -d postgres redis
scripts/import-ttc-gtfs-schedule.sh /tmp/ttc-merged-gtfs.zip
```

These arrivals are timetable-based estimates, not live train predictions. If no import is active, the station detail API returns a schedule-unavailable state and the frontend fallback remains demo-labeled.

### Alert Scenario Harness

The repository includes dev/test TTC Live Alerts scenario feeds under
`backend/src/test/resources/fixtures/ttc-alert-scenarios/`. These fixtures are
TTC-shaped examples for LineWatch testing only; synthetic records are used where
captured public examples are not available.

Generate the fixture catalog after editing scenario definitions:

```bash
node scripts/generate-alert-scenarios.mjs
```

Serve a scenario as a local TTC Live Alerts feed:

```bash
node scripts/mock-alerts-server.mjs all-alert-types
node scripts/mock-alerts-server.mjs nonlinear-union-curve
node scripts/mock-alerts-server.mjs nonlinear-st-george-spadina
node scripts/mock-alerts-server.mjs line-5-suspension
node scripts/mock-alerts-server.mjs nightly-closure-active-window
node scripts/mock-alerts-server.mjs station-node-impact
```

Run the backend against a scenario:

```bash
scripts/dev-alert-scenario.sh all-alert-types
```

If `tmp/ttc-merged-gtfs.zip` or `/tmp/ttc-merged-gtfs.zip` exists, the scenario
backend also imports scheduled rapid-transit arrivals into the `linewatch_scenario`
database. Override the zip location with `LINEWATCH_SCENARIO_GTFS_ZIP=/path/to/gtfs.zip`.

Then open the scenario frontend with `scripts/dev-frontend-scenario.sh` and inspect
`/api/alerts`, `/api/map`, alert cards, station rings, nonlinear overlays, and
schedule-aware station arrivals. The scenario harness does not make the app an
official TTC product and does not represent a live feed.


Current backend scope:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend service health. |
| `GET` | `/api/health/ingestion` | Latest TTC Live Alerts poll status and record counts. |
| `GET` | `/api/map` | Seeded station/topology data plus fresh layered segment and station-node impact metadata when ingestion is current. |
| `GET` | `/api/status` | Line status derived from fresh normalized alerts, otherwise no stale live impacts. |
| `GET` | `/api/alerts?type=live\|delay\|planned\|slowdown` | Fresh normalized suspension/active alert cards, ordinary delay cards, planned closures, and Reduced Speed Zone groups. |
| `GET` | `/api/stations?query={q}` | Seeded station summaries and search. |
| `GET` | `/api/stations/{id}` | Station detail with reviewed facilities, source-labeled arrivals (demo/unavailable/live), and fresh directly linked TTC outage/alert rows when ingestion is current. |

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
- Separate ordinary delay and Reduced Speed Zone cards.
- Clickable/tappable alert segments and single-station impact rings.
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
- The visible dashboard treats successful poll results as usable only inside the configured freshness window.
- TTC alerts can be vague.
- Some alerts name broad corridors rather than exact station-to-station segments.
- Planned closure pages or feeds may change format.
- Segment inference may be imperfect.
- Overnight closed-mode uses general TTC subway operating hours; exact first and last trains vary by station, holidays, and service changes.
- Saved commute route matching uses scheduled adjacent-station weights from the active TTC GTFS import when available and deterministic topology fallback weights otherwise. It is useful for in-app route awareness, but it is not a full TTC trip planner and does not reflect live train travel times.
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

1. Connect a public live-arrival source to the existing arrival provider when one becomes available for TTC subway lines.
2. Import static GTFS shapes and implement production alert-to-segment matching.
3. Implement saved commute impact matching and reliability aggregation.
4. Deploy and publish measured API/build/test metrics.

## License and Disclaimer

This is an unofficial commuter tool and portfolio project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission.
