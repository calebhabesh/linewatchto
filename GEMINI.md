# Agent Guide for LineWatch TO

Last updated: 2026-06-15

This repository contains LineWatch TO, an unofficial TTC reliability dashboard. The app is a portfolio-grade full-stack project intended to show Java/Spring backend engineering, PostgreSQL/PostGIS data modeling, Redis caching, public transit ingestion, and a polished Next.js interface for Toronto subway and LRT reliability.

The user-facing product name is **LineWatch TO**. The portfolio case-study name may be **TTC Reliability Navigator**. Never present the project as an official TTC product.

## Current Reality

The project is early but no longer an empty scaffold.

- `frontend/` contains a Next.js App Router dashboard with an edited SVG-backed subway/LRT map, React-controlled alert overlays, active alerts, separate delay and Reduced Speed Zone submenus, upcoming closures, saved commute impact cards, reliability summaries, display toggles, and a mobile bottom nav.
- `frontend/src/app/linewatch-data.ts` is the current typed fixture/API-shape seam.
- `frontend/src/app/transit-map.tsx` loads the edited map asset and renders interactive overlay paths in the same SVG coordinate system.
- `frontend/public/assets/linewatch/` contains the edited TTC map SVG, line legend SVG icons, and station accessibility SVG icons.
- `frontend/tests/linewatch-data.test.mjs` verifies the fixture layer with Node's built-in test runner.
- `backend/` contains a Spring Boot app with seeded dashboard APIs, TTC alert ingestion services, health endpoints, and backend tests.
- `docker-compose.yml` provides PostgreSQL/PostGIS and Redis.
- The project includes seeded PostGIS migrations for stations and transit lines.
- Seeded demo dashboard APIs (`/api/map`, `/api/status`, `/api/alerts`, `/api/stations`) are implemented.
- Next.js Server Component loads data with complete local-fixture fallback.
- Playwright Chromium smoke tests cover seeded API rendering, fixture-fallback rendering, delay overlay clicks, single-station impact ring interactions, and station accessibility details.
- Opt-in TTC Live Alerts polling, raw source staging, supported subway/LRT normalization, accessibility-outage normalization, alert snapshotting, and `/api/health/ingestion` are implemented.
- TTC alert polling is disabled by default. For local live overlays, run `scripts/dev-backend-live.sh`, which starts the backend with the `dev-live` Spring profile.
- Visible `/api/alerts`, `/api/status`, `/api/map`, and dynamic `/api/stations/{id}` rows can read normalized TTC alert records while the latest successful ingestion run is fresh; stale successful runs are suppressed from alert cards, line status, map overlays, and station details after the configured dashboard freshness window.
- Delay cards are distinct from explicit Reduced Speed Zone cards. Started timing comes from `activePeriod.start` where available, and Updated timing comes from TTC `lastUpdated` where available.
- Map segment overlays and single-station alert rings are clickable/tappable and open the corresponding submenu card.
- Every mapped Line 1, 2, 4, 5, and 6 stop has station-line tags and reviewed line-specific wheelchair/elevator metadata. Station detail shows authored accessibility icons plus fresh directly linked TTC station alerts and elevator/escalator outages. Station arrivals use a source-labeled provider architecture. Station arrivals use source-labeled TTC scheduled service when a merged GTFS schedule import is active. They are timetable-based estimates, not live subway/LRT predictions. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data. Nightly closure active-window gating is fully implemented.
- Global accessibility outages dashboard with elevator and escalator drill-downs grouped by transit line and station, plus a searchable surface service notices dashboard (category filtered, route/stop search) are implemented.
- Account-backed saved commutes compute a weighted default rapid-transit path over the seeded Line 1, 2, 4, 5, and 6 topology, using active GTFS scheduled median segment weights when available, seeded per-segment fallback travel times otherwise, and constant topology weights only as a last resort, then match dashboard-visible service impacts against every path segment and station-node impact with direction-aware segment matching. Saved commutes can monitor an optional return trip as a separate leg inside the same card.
- Account-backed Web Push subscription, preference, dedupe, delivery, service-worker display plumbing, saved-commute impact notifications, opt-in line-wide subscriptions for Lines 1, 2, 4, 5, and 6, event-type filters, and planned-closure reminder buckets are implemented. Delivery is inactive unless browser permission is granted, VAPID keys are configured, `linewatch.push.enabled` is true, and fresh dashboard-visible impacts exist.
- Populated geographic geometry, production segment matching, standalone commute-impact API, route review/edit, commute email notifications, and reliability aggregation are planned but not yet implemented.

Do not claim that the visible dashboard is live unless there is a fresh successful ingestion run. Do not claim imported GTFS geometry, production geospatial matching, Redis-backed status, real analytics, or live station arrivals until those features exist in code and have passing verification.
Do not claim saved commutes send push notifications unless Web Push is configured/enabled and the notification is based on fresh dashboard-visible saved-commute impacts. Do not claim saved commutes send email notifications, recommend alternate routes, account for walking transfers, provide route review/edit, provide accessibility-personalized matching, or use live train movement for route timing.
Do not claim global accessibility outages or surface notices send push notifications or are included in saved commute matching, segment overlays, or status ratings. Do not claim surface notices are active in fallback fixture mode.

## Product Target

The intended user experience should resemble a dense transit operations dashboard inspired by subwaystatus.live:

- Map-first, mobile-optimized interface.
- Dark transit-control-room visual language, with a high-contrast mode.
- TTC subway/LRT line colors as the strongest visual anchors.
- Red overlays for suspended service.
- Orange static overlays for ordinary delays.
- Chevron overlays for explicit Reduced Speed Zones.
- Planned closure previews that can be highlighted on the map.
- Clickable or tappable affected line segments and single-station impact rings.
- Clear alert cards with line number, affected segment, age, source, and shuttle status.
- Upcoming closure timeline for today, this weekend, and later dates.
- Saved commute cards answering whether a route is affected.
- Reliability and ingestion health panels for portfolio depth.

This is an app dashboard, not a marketing landing page. The first screen should always be the usable product.

## Stack

Frontend:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS is available, but plain CSS in `frontend/src/app/globals.css` is also used.
- Node's built-in test runner is used for fixture tests.

Backend:

- Java 21.
- Spring Boot.
- Maven.
- Spring Web.
- Spring Data JPA.
- Spring Data Redis.
- Bean Validation.
- Flyway.
- PostgreSQL driver.

Infrastructure:

- Docker Compose.
- PostgreSQL with PostGIS.
- Redis.

## Repository Layout

```text
backend/        Spring Boot API, ingestion services, and backend tests
frontend/       Next.js dashboard, fixtures, UI, and frontend checks
docs/           Design specs and implementation plans
AGENTS.md       Shared agent guidance
GEMINI.md       Copy of this guidance for Gemini and antigravity-cli style tools
README.md       Human-facing project overview and setup guide
```

## Core Commands

Run commands from the repository root unless noted.

Frontend:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run dev
npm --prefix frontend run test:smoke
```

Backend:

```bash
mvn -f backend/pom.xml test
mvn -f backend/pom.xml spring-boot:run
scripts/dev-backend-live.sh
```

Infrastructure:

```bash
docker compose up -d postgres redis
docker compose down
```

Health check:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/ingestion
```

## Verification Policy

Do not call work complete until relevant checks have been run and read.

For frontend-only changes, run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

For substantial frontend changes, also run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

For backend changes, run:

```bash
mvn -f backend/pom.xml test
```

For cross-stack changes, run both frontend and backend checks. If a command cannot run because of sandboxing, network restrictions, missing services, or local environment issues, report the exact command and failure.

## Development Rules

- Preserve user changes. Check `git status --short` before large edits and do not revert unrelated work.
- Prefer `rg` and `rg --files` for search.
- Keep edits scoped to the feature or documentation request.
- Use existing project patterns before inventing new abstractions.
- Avoid broad refactors unless they directly reduce risk for the requested work.
- Add tests around meaningful behavior. For frontend fixtures and pure logic, use `frontend/tests/*.test.mjs`.
- Keep data shapes close to the future API contract so fixture-backed UI can later switch to Spring endpoints.
- Do not add new dependencies unless the benefit is clear and verification can run.
- Do not store secrets, API keys, TTC feed tokens, or local credentials in Git.

## Frontend UX Rules

- Build the app experience directly; do not add a landing page.
- Keep map and current status as first-viewport content.
- Use TTC line colors for route identity:
  - Line 1: yellow.
  - Line 2: green.
  - Line 4: purple.
  - Line 5: orange.
- Use red only for suspended or closed service.
- Use orange only for delay or degraded service.
- Use blue for planned-preview highlights.
- Keep cards at 8px border radius or less.
- Do not nest decorative cards inside other decorative cards.
- Avoid decorative gradient orbs, bokeh blobs, and purely ornamental hero art.
- Avoid one-note color palettes. The UI can be dark, but it should be neutral dark with TTC line colors, not a single blue/purple theme.
- Make controls stable in size so toggles, badges, and labels do not shift layout.
- Ensure mobile text fits without overlapping.
- Use high-contrast mode for readability, not as a separate feature page.
- Keep animation subtle and provide a static-motion toggle.

## Backend Direction

The backend now owns:

- Opt-in scheduled polling for the official TTC Live Alerts feed.
- Raw staging for route and accessibility alert records.
- Supported subway/LRT delay, suspension, and planned-closure normalization.
- Persisted route-alert impact kind so ordinary delays are not grouped as Reduced Speed Zones.
- `/api/alerts?type=delay` returns ordinary delay cards separately from `/api/alerts?type=slowdown` Reduced Speed Zone groups.
- Active alert, delay, planned-closure, and Reduced Speed Zone DTOs expose Started and Updated timestamps from normalized source timing.
- Elevator and escalator outage normalization with seeded station links where names resolve.
- Complete station-line tagging with reviewed line-specific wheelchair/elevator metadata and authored station-detail icons.
- Fresh directly linked TTC station alerts and elevator/escalator outages in `/api/stations/{id}`, suppressed when ingestion is stale.
- Source-ID upserts, alert snapshots, ingestion-run tracking, and `/api/health/ingestion`.
- Live Alerts reduced-speed records now derive explicit cardinal direction from TTC wording.
- `Both ways` and `both ways` source directions resolve to bidirectional travel with line-aware cardinal labels.
- Map overlays expose layered impact metadata and project onto adjacent rapid-transit topology links.
- Station-node impacts are exposed for single-station alert rings.
- Ordinary overlay links resolve from SVG station-dot anchors.
- Nonlinear overlays resolve from the authored hidden segment-guides-layer.
- Opposite-direction Reduced Speed Zone records merge into one bidirectional effect and grouped card.
- Directionless Reduced Speed Zone records render bidirectionally without inventing a direction label.
- `/api/performance` exposes source-labeled official TTC.ca on-time and elevator/escalator status metrics with a low-frequency refresh guard and stale last-good fallback when TTC.ca cannot be parsed or fetched.
- Redis-backed dashboard caching is implemented for current status, map, alerts, ingestion health, and performance reads. Cache misses and Redis outages fall back to live/database computation, and alert ingestion success evicts dashboard cache keys.

The backend should eventually own:

- Static TTC GTFS import for subway/LRT routes, stops, trips, and shapes.
- PostGIS modeling for stations, line segments, and shapes.
- Additional planned-closure source ingestion if needed beyond the live-alert feed.
- TTC Reduced Speed Zones webpage ingestion if needed beyond the live-alert feed.
- Alert-to-line/station/segment impact matching.
- Reliability aggregation.
- Commute impact matching.
- User-facing live status reads and source-labeled live station arrivals.

Planned API contract:

```text
GET  /api/status
GET  /api/map
GET  /api/alerts?type=live|delay|planned|slowdown
GET  /api/stations?query={q}
POST /api/commutes/impact
GET  /api/reliability/lines
GET  /api/reliability/stations/{id}
GET  /api/performance
GET  /api/health/ingestion
```

The current backend implements seeded-demo dashboard boundaries (`/api/map`, `/api/status`, `/api/alerts`, `/api/stations`), service health (`/api/health`), an opt-in TTC alert ingestion pipeline with `/api/health/ingestion`, and official performance metrics (`/api/performance`). Build the live read switch incrementally and keep fixture mode available for demos and tests.

## Data Source Guardrails

Use public, source-linked data only. The README should identify data limitations clearly:

- TTC alerts may be vague.
- Alert text may not include exact station-to-station geometry.
- Segment inference can be imperfect.
- Planned closure sources may change format.
- The app is unofficial and should not be relied on as the sole source of truth.

## Documentation Expectations

Keep README claims aligned with working code. A strong README should include:

- What the app does now.
- What is fixture-backed.
- What the backend currently supports.
- Stack and repo layout.
- Local setup commands.
- Verification commands.
- Product roadmap.
- Data source limitations.
- Portfolio engineering story.

When changing agent instructions, update both `AGENTS.md` and `GEMINI.md` together.

## Suggested Next Implementation Order

1. Connect a public live-arrival source to the existing `PublicArrivalClient` when one becomes available for TTC subway lines.
2. Import static GTFS shapes and implement production alert-to-segment matching.
3. Implement commute impact matching and reliability aggregation.

## Agent Handoff Notes

If you are antigravity-cli, Gemini, Codex, or another coding agent:

- Read this file, the README, and the relevant docs under `docs/superpowers/` before major changes.
- State whether you are touching frontend, backend, docs, or infrastructure.
- Run the smallest meaningful failing test before behavior changes when practical.
- Run verification before claiming success.
- Summarize changed files and commands run.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/` contains generated TTC-shaped alert scenario feeds for dev/test coverage.
- `scripts/alert-scenario-catalog.mjs` is the source of truth for those generated fixtures; run `node scripts/generate-alert-scenarios.mjs` after editing it.
- `scripts/dev-alert-scenario.sh <scenario-name>` runs the backend against a local scenario feed for manual browser testing.
- Scenario records may be synthetic when captured public TTC samples are unavailable; do not describe scenario data as live TTC service.
- Do not overclaim features that are only represented by fixtures.
- Station arrivals are scheduled rapid-transit estimates when a merged TTC GTFS schedule import is active. They are not live TTC subway/LRT predictions. Surface connections are outside this slice. Do not claim live station arrivals until an official rapid-transit realtime source exists and is integrated with passing verification.
