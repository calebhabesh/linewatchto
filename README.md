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
- Account-backed saved commutes with weighted default rapid-transit route matching, optional return-trip monitoring, direction-aware Reduced Speed Zone matching, and dashboard-visible impact summaries.
- Account-backed Web Push notification subscriptions and preferences for saved-commute impacts. Delivery is opt-in and requires browser permission, a browser that supports PWA Web Push, configured VAPID keys, `LINEWATCH_PUSH_ENABLED=true`, and fresh dashboard-visible impacts.
- Account sign-in supports password reset through emailed reset links when SMTP is configured, with a local/dev reset-token fallback.
- Official TTC.ca performance metrics panel for current on-time and elevator/escalator status, source-labeled with the TTC.ca updated timestamp, daily refresh guard, and stale last-good fallback.
- Redis-backed dashboard cache for status, map, alerts, ingestion health, and TTC performance reads, with database/live fallback when Redis is unavailable.
- Ingestion/system health panel in fixture mode.
- High-contrast display toggle.
- Motion/static-background toggle.
- Mobile bottom navigation.
- Installable mobile PWA shell with supplied LineWatch icons, standalone display metadata, cached static assets, and a conservative offline page that does not replay stale service data.
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
- GTFS import and static shapes remain unimplemented.
- Populated geographic PostGIS geometry and production geospatial matching remain unimplemented.
- TTC Reduced Speed Zones webpage ingestion remains unimplemented.
- Station arrivals use source-labeled TTC scheduled service when a merged GTFS schedule import is active. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data.
- The arrival provider architecture supports live, scheduled, unavailable, and demo status states.
- Standalone commute-impact endpoint, route review/edit, commute email notifications, alternate-route suggestions, and accessibility-personalized commute matching.
- Line-wide Web Push subscriptions are implemented for Lines 1, 2, 4, 5, and 6, but they are opt-in and filtered by selected line, event type, and reminder timing. Reduced Speed Zone line-wide alerts default off to avoid noisy long-running notifications.
- Real historical LineWatch reliability aggregation remains unimplemented.
- Redis cache improves current read performance; it does not make stale TTC alert data live.

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

## Deployment

Backend deployment requires Java 21, PostgreSQL/PostGIS, Redis, and the environment variables listed in `.env.example`.
Frontend deployment requires `BACKEND_URL` for server-side dashboard loading and the frontend `/api/*` proxy. Browser-side account, station detail, saved-commute, and log requests use same-origin `/api/*` paths by default so LAN mobile testing works from URLs such as `http://192.168.x.x:3000`. Set `NEXT_PUBLIC_LINEWATCH_API_BASE_URL` only when browsers should call a separate backend origin directly.
For production auth with a separate browser-to-backend origin, set `LINEWATCH_AUTH_SECURE_COOKIE=true`, set `LINEWATCH_AUTH_ALLOWED_ORIGINS` to the deployed frontend origin, and keep `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false`.

After both deployments are live, run the deployment smoke checker:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://your-frontend.example \
LINEWATCH_DEPLOY_BACKEND_URL=https://your-backend.example \
node scripts/smoke-deploy.mjs
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

The PWA service worker caches static assets and the offline page only. It intentionally bypasses `/api/*` responses so current TTC service, station, and commute data are never replayed as fresh while offline.

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

This dev helper also enables local password-reset links by default. It returns a short-lived reset token to the frontend for existing local accounts so the `Forgot password?` flow can be tested without email delivery.

To send real password reset emails from a local run, configure SMTP credentials before starting the backend:

```bash
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=true \
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=http://localhost:3000 \
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@example.com \
SPRING_MAIL_HOST=smtp.example.com \
SPRING_MAIL_PORT=587 \
SPRING_MAIL_USERNAME=your-smtp-user \
SPRING_MAIL_PASSWORD=your-smtp-password \
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true \
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true \
scripts/dev-backend-live.sh
```

Password reset emails are sent as multipart HTML with a plain-text fallback and an inline LineWatch TO logo from `backend/src/main/resources/email/linewatch-logo.png`.

Do not commit SMTP usernames, passwords, API keys, or app passwords.

To send saved-commute Web Push notifications, configure VAPID keys and enable the push scheduler before starting the backend:

```bash
LINEWATCH_PUSH_ENABLED=true \
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=your-url-safe-public-key \
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=your-url-safe-private-key \
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:you@example.com \
scripts/dev-backend-live.sh
```

For local push testing, use the helper that generates/reuses local VAPID keys under ignored `tmp/linewatch-vapid.env` and starts the live backend with push enabled:

```bash
scripts/dev-backend-live-push.sh
```

For end-to-end mobile PWA push testing through a configured Cloudflare Tunnel, use:

```bash
scripts/dev-cloudflare-push.sh
```

The script reads `~/.cloudflared/config.yml`, uses the first `hostname:` as the public HTTPS origin, starts the backend with secure auth cookies and Web Push enabled, starts the frontend with service worker registration enabled in dev mode, and starts `cloudflared tunnel run`. With the checked-in tunnel shape, open and install `https://linewatch-dev.calebhabesh.com` on the phone.

If the tunnel is already running separately, start only the app processes with:

```bash
LINEWATCH_SKIP_CLOUDFLARED=true scripts/dev-cloudflare-push.sh
```

The browser still controls permission prompts and delivery. Local HTTP development works only where the browser treats the origin as trustworthy, such as `localhost`; production should use HTTPS. Notification bodies are fetched by the service worker from the signed-in account endpoint, so stale service data is not cached into offline notifications. Saved-commute disruption notifications use stable tags and Web Push topics. When a current disruption clears, LineWatch sends a quiet same-tag `Commute alert cleared` replacement where delivery is allowed; when the app opens or receives another push event, the service worker asks the backend which saved-commute notification tags are still active and closes stale LineWatch notifications where the browser allows it.

Device push enablement is per browser/device. Saved-commute, line-wide, event-type, and reminder preferences are account-level and can be changed before a browser subscription exists, but delivery requires at least one enabled browser subscription plus configured VAPID keys.

Health endpoint:

```bash
curl http://localhost:8080/api/health
```

Alert ingestion is disabled by default for offline-safe local runs, CI, and demos that should not depend on the TTC public API. The `scripts/dev-backend-live.sh` command runs the backend with the `dev-live` Spring profile, which enables one scheduled poller process.

Equivalent manual command:

```bash
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=true mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev-live
```

`LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE` controls how long a successful poll can drive visible dashboard data. The default is `PT10M`; when that window expires, `/api/status`, `/api/alerts`, and `/api/map` stop using old active alert rows.

Inspect its latest poll result:

```bash
curl http://localhost:8080/api/health/ingestion
```

Official TTC.ca performance metrics are intentionally fetched slowly because the TTC homepage is not an API and appears to update on a daily cadence. `LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL` defaults to `PT24H`, `LINEWATCH_PERFORMANCE_TTC_MAX_AGE` defaults to `PT48H`, and `LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL` defaults to `PT6H`.

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
| `GET` | `/api/account/push/config` | Account push availability, VAPID public key, account-level notification preferences, line subscriptions, event-type filters, and reminder timing. |
| `PUT` | `/api/account/push/subscription` | Store or refresh the current browser Web Push subscription for the signed-in account. |
| `PUT` | `/api/account/push/preferences` | Update account-level saved-commute, line subscription, event-type, and reminder timing notification preferences. |
| `POST` | `/api/account/push/latest` | Let the service worker fetch the latest pending notification payload for the current subscription. |
| `POST` | `/api/account/push/active` | Return currently active saved-commute notification tags so the service worker can close stale notifications. |
| `POST` | `/api/account/push/subscription/disable` | Disable the current browser push subscription for the signed-in account. |

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
- Opt-in saved-commute Web Push alerts for dashboard-visible impacts when push is configured.
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
- Commute email notifications.

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
- Saved commute route matching uses scheduled adjacent-station weights from the active TTC GTFS import when available, then seeded per-segment fallback travel times, with deterministic topology fallback weights only as a last resort. Return trips are computed as a separate monitored leg when enabled, and directional service impacts only count when they match the commute leg direction or are bidirectional. This is useful for in-app route awareness, but it is not a full TTC trip planner and does not reflect live train travel times.
- Saved-commute push notifications are derived from the same dashboard-visible impact matching. They should not be described as comprehensive TTC alerts, all-map alerts, or guaranteed delivery.
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
3. Implement real historical reliability aggregation.
4. Publish measured API/build/test metrics.

## License and Disclaimer

This is an unofficial commuter tool and portfolio project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission.
