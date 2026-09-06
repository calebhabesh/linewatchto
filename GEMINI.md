# Agent Guide for LineWatchTO

Last updated: 2026-08-26

This repository contains LineWatchTO, an unofficial transit reliability dashboard for TTC subway/LRT and GO/UP rail. The app is a portfolio-grade full-stack project intended to show Java/Spring backend engineering, PostgreSQL/PostGIS data modeling, Redis caching, public transit ingestion, and a polished Next.js interface.

The user-facing product name is **LineWatchTO**. The portfolio case-study name may be **TTC Reliability Navigator**. Never present the project as an official TTC or Metrolinx product.

## Current Reality

The project is early but no longer an empty scaffold.

- `frontend/` contains a Next.js App Router dashboard with SVG-backed TTC and GO/UP maps independently re-created by the developer in Inkscape, React-controlled alert overlays, active alerts, separate delay and Reduced Speed Zone submenus, upcoming closures, My Commutes impact cards, reliability summaries, display toggles, and a mobile bottom nav.
- `mobile/` contains an Expo SDK 57 / React Native TypeScript prototype scaffold with Expo Router, development-build/EAS configuration, runtime-validated aggregate dashboard reads, foreground-aware polling, persisted query caching, dark/high-contrast tokens, a map-first native shell, an initial TTC SVG-path renderer, station search, a SecureStore session seam, Jest contract tests, and a Maestro smoke skeleton. It does not yet implement complete native map interaction, station details, accounts, My Stations, My Commutes, or native push.
- `frontend/src/app/linewatch-data.ts` is the current typed fixture/API-shape seam.
- `frontend/src/app/transit-map.tsx` loads the authored map asset and renders interactive overlay paths in the same SVG coordinate system.
- `frontend/public/assets/linewatch/` contains the authored TTC and GO/UP map SVGs, line legend SVG icons, and station accessibility SVG icons. Both maps were independently re-created in Inkscape for optimized app rendering and data referencing/formatting as derivative replicas of referenced TTC and Metrolinx maps; they are not downloaded official map files.
- `frontend/tests/linewatch-data.test.mjs` verifies the fixture layer with Node's built-in test runner.
- `backend/` contains a Spring Boot app with seeded dashboard APIs, TTC alert ingestion services, health endpoints, and backend tests.
- `docker-compose.yml` provides local PostgreSQL/PostGIS and Redis; `docker-compose.prod.yml` self-hosts Caddy, frontend, backend, PostgreSQL/PostGIS, and Redis on the Oracle ARM64 VPS.
- `docker-compose.staging.yml` provides an on-demand staging stack for the development server. It builds local images from the current checkout, uses isolated staging volumes and `.env.staging`, routes through `Caddyfile.staging`, and can optionally expose the stack through Cloudflare Tunnel with Cloudflare Access configured outside the repo.
- Production application images are built as ARM64 artifacts on the development server, published to public GHCR packages, and selected on the VPS through `.env.release`; the VPS pulls images and does not build them.
- `infra/postgres/Dockerfile` builds the production PostGIS image from the official multi-architecture PostgreSQL 17 image because the selected official `postgis/postgis` tag is AMD64-only.
- The project includes seeded PostGIS migrations for stations and transit lines.
- Seeded demo dashboard APIs (`/api/map`, `/api/status`, `/api/alerts`, `/api/stations`) are implemented.
- Next.js Server Component loads data with complete local-fixture fallback.
- Playwright Chromium smoke tests cover seeded API rendering, fixture-fallback rendering, TTC overlay and single-station impact-ring activation, desktop search/status separation, alert-dropdown alignment, My Stations empty/undo state, performance-row selection, mobile push-preference interaction, and station accessibility details.
- Opt-in TTC Live Alerts polling, filtered TTC GTFS-RT bus/streetcar service-alert supplementation for surface notices, raw source staging, supported subway/LRT normalization, accessibility-outage normalization, alert snapshotting, and `/api/health/ingestion` are implemented.
- Opt-in backend-only Metrolinx Open API polling requires GO service and UP Express GTFS-RT alerts and independently attempts supplemental GO information, marketing, GTFS-RT alerts, Train Exceptions, and GO GTFS-RT TripUpdates. Rider-alert collections are raw-staged under separate source namespaces; identified exceptions and TripUpdate entities are retained in a separate operational store. An unavailable supplemental collection does not fail the poll or deactivate its last-good rows. Reviewed mapped GO service-disruption and supported UP records are normalized; fresh successful runs can drive the GO/UP line status, cards, map segments, and station rings through `/api/dashboard?network=regional`, and `/api/health/regional-ingestion` reports freshness plus completeness and record counts for all seven collections. Fresh operational records can drive purpose-built GO trip changes through `/api/regional/trip-changes` only when exactly one active static-GTFS trip and its mapped stops match. Fresh rider-alert records explicitly categorized as Train Cancellation can also appear there; exact static-GTFS matches merge with operational signals, while unmatched cancellations remain source-labeled and do not invent schedule times or stop coverage. Supported schedule-backed cancellations, skipped stops, and explicitly identified added stops appear on matching arrival tiles and in station detail. Only schedule-backed cancellations can match My Commutes. Duplicate exception/TripUpdate/rider-alert cancellation signals merge, while ambiguous operational rows remain internal. The regional ingestion log displays all seven collection states plus static-schedule lookahead. The developer key and raw payloads are never sent to the browser.
- Independently configurable GO/UP station arrivals are implemented through `/api/regional/stations/{stationId}/arrivals`. GO estimates use station-scoped Metrolinx Next Service rows filtered to trains; exact trip-number matches against the separately freshness-gated and briefly cached Metrolinx in-service train collection can add a source-published coach count to GO arrival tiles. UP estimates use the dedicated GTFS-RT TripUpdates full dataset and do not invent coach counts. Persisted public GO/UP static-GTFS schedules can supply scheduled fallback without a developer key, including later service days for infrequent corridors. Matching fresh estimates win, missing trips and corridors remain source-labeled scheduled, and the read distinguishes no scheduled service from unavailable data.
- Independently configurable station-scoped surface connections are implemented through `/api/stations/{stationId}/surface-connections` and `/api/regional/stations/{stationId}/surface-connections`. TTC polls the bus and streetcar GTFS-RT Trip Updates feeds once on the backend and indexes predictions only through published static-GTFS `parent_station` links to mapped stations; the active merged GTFS import also retains the bounded surface route/trip/stop catalog needed for that join. GO/UP mode exposes GO Bus rows from station-scoped Metrolinx Next Service. Both reads have independent freshness and availability states, show bay/platform only when the source publishes it, and do not add surface routes, vehicles, alerts, or overlays to either map. TTC does not use proximity matching; regional scope does not include municipal transit agencies around GO stations.
- Independently opt-in GO/UP estimated train markers are implemented through `/api/regional/trains`. The backend reads the dedicated GO and UP Express GTFS-RT VehiclePosition full datasets, freshness-gates and briefly caches them, drops records that cannot be mapped cleanly to a reviewed adjacent regional topology link, and exposes source-labeled schematic placements. The frontend uses the existing per-device estimated-train toggle in regional mode and renders the placements on authored regional segments.
- TTC alert polling is disabled by default. For local live overlays, run `scripts/dev-live-backend.sh`, which starts the backend with the `dev-live` Spring profile. When alert polling is enabled, the GTFS-RT surface supplement defaults to TTC bus and streetcar service-alert feeds and filters out rapid-transit GTFS-RT records before normalization.
- Visible `/api/alerts`, `/api/status`, `/api/map`, and dynamic `/api/stations/{id}` rows can read normalized TTC alert records while the latest successful ingestion run is fresh; stale successful runs are suppressed from alert cards, line status, map overlays, and station details after the configured dashboard freshness window.
- Reviewed TTC station notices are exposed only on affected station details; the seeded Warden construction notice is source-labeled and absent from fallback fixtures. An independently opt-in daily TTC sitemap monitor uses `lastmod` for changed-page checks, rate-limits requests, forces a weekly reconciliation, and stages added, changed, or removed page notices for human review. Detection never publishes or deactivates rider-facing notices automatically, and `/api/health/station-notices` exposes only safe run counters and the pending-review count.
- Delay cards are distinct from explicit Reduced Speed Zone cards. Started timing comes from `activePeriod.start` where available, and Updated timing comes from TTC `lastUpdated` where available.
- Map segment overlays and single-station alert rings are clickable/tappable and open the corresponding submenu card.
- Every mapped Line 1, 2, 4, 5, and 6 stop has station-line tags and reviewed line-specific wheelchair/elevator metadata. Station detail shows authored accessibility icons plus fresh directly linked TTC station alerts and elevator/escalator outages. Station arrivals use a source-labeled provider architecture. The default provider uses source-labeled TTC scheduled service when a merged GTFS schedule import is active. The opt-in `live` provider polls TTC GTFS-RT Subway Trip Updates, resolves `stop_id` values through the active static GTFS import, returns fresh live rows where mapped, and falls back to scheduled rows when live data is stale, missing a direction, or missing a line. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data. The backend can automatically refresh the active merged TTC GTFS schedule import from the public CKAN package when `LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true`, and exposes `/api/health/schedule`. Automatic GTFS schedule refresh uses a two-pass streaming import to run inside a bounded 1 GB heap, streaming the 4.2M-row stop_times.txt twice, inserting rows in transactional batches of 1,000, and recording outcomes to `ingestion_runs`. Failed refresh attempts are recorded and do not deactivate the previously active schedule. Nightly closure active-window gating is fully implemented: LineWatchTO derives active state from TTC parent/child periods, keeps the canonical event in Planned Closures, and also exposes it as a current active alert, line status, commute impact, and red map overlay during the active window. If TTC publishes that active child as a standalone route alert, LineWatchTO links it by the exact parent-period source ID, uses the child identity and active-alert icon for the single current map impact, and exposes a related planned-closure details action. If no standalone child exists, the canonical closure remains the projected current alert during its effective window.
- Network-scoped accessibility outages dashboard with elevator and escalator drill-downs grouped by TTC line or GO/UP corridor and mapped station is implemented. TTC uses fresh Live Alerts rows. GO/UP uses fresh Metrolinx `Amenity` / `Elevator-Escalator Disruption` records from the existing backend-only alert poll, omits restoration notices and unmapped/bus-only facilities, and shows the same purpose-built rows in regional station detail. The searchable notices dashboard is network-scoped: TTC uses Live Alerts plus filtered bus/streetcar GTFS-RT service-alert records, while GO/UP exposes separate Service Notices and Trip Changes views. Service Notices uses fresh raw-staged Metrolinx Information and Marketing alert records plus bus-only notices from the GO GTFS-RT alerts collection, plus explicit GO timetable announcements from service-alert and GTFS-RT rail records. Trip Changes combines confidently schedule-matched GO operational records with fresh structured rider-alert train cancellations; unmatched rider-alert cancellations remain visible and source-labeled but cannot annotate arrivals or match My Commutes. Regional notices and trip changes do not imply that the API mirrors every notice published on the GO or UP websites.
- Account-backed My Commutes routes compute a weighted default rapid-transit path over the seeded Line 1, 2, 4, 5, and 6 topology, using active GTFS scheduled median segment weights when available, seeded per-segment fallback travel times otherwise, and constant topology weights only as a last resort, then match dashboard-visible service impacts against every path segment and station-node impact with direction-aware segment matching. Riders can review the computed stop list and map path and edit TTC route endpoints, label, and return-leg monitoring; edits recalculate the weighted path and disruption matches while preserving the route's notification rule. My Commutes can monitor an optional return trip as a separate leg inside the same card, show standard-vs-impacted travel-time estimates with confidence labels, and store per-route notification rules with independently scheduled outbound and return days/time windows and event types. Every enabled leg monitors its complete computed route. Delays and Reduced Speed Zones can produce bounded extra-time ranges; suspensions and closures are marked unreliable rather than assigned a fake detour duration.
- Network-scoped regional My Commutes computes GO/UP-only paths over the reviewed 72-station/74-link regional topology, supports shared-station and Union transfers, endpoint/label/return-leg editing, map path review, low-confidence planning-time estimates, freshness-gated corridor, segment, and station disruption matching, and granular per-route Web Push rules. Cross-network TTC-to-GO/UP routing is not implemented.
- Account-backed My Stations lets signed-in riders save mapped stations from station detail, global search, or a dedicated searchable/filterable/sortable submenu. Saved station rows reuse freshness-gated station impact and accessibility-outage summaries. Desktop Account and mobile More expose the watchlist, and mobile More also includes the My Commutes shortcut. My Stations does not send push notifications.
- Account-backed Web Push subscription, preference, dedupe, delivery, service-worker display plumbing, TTC and regional saved-commute impact notifications, per-saved-commute granular notification rules, opt-in line-wide subscriptions for Lines 1, 2, 4, 5, and 6, opt-in corridor subscriptions for all eight GO/UP routes, event-type filters including a distinct regional train-cancellation preference, planned-closure reminder buckets, auth input length caps, and auth endpoint rate limiting are implemented. Device push enablement is per browser/device. Account notification preferences remain account-level across PWA reinstall or browser changes; saved-commute route rules further narrow delivery by account-owned saved route, independent outbound/return Toronto-time schedules, and event type across each leg's complete computed path. A corridor subscription can notify for a fresh structured cancellation on that corridor. A My Commutes cancellation notification additionally requires an exact static-GTFS match, at least two path stops in matching order/direction, the scheduled trip time inside the selected leg schedule, and the current time inside that notification window. Cancellation expiry does not generate a service-restored push. Current impacts that begin outside a configured window are observed and can notify once when their natural window opens; enabling or editing a route rule silently baselines already-active current impacts instead of sending catch-up OS pushes. Planned-closure pushes are delivered only while the relevant leg's window is open, and saved-commute service-restored pushes also honor the route-level restored toggle, leg selection, and current leg window. Service-restored pushes are only sent for current impacts that previously produced an active saved-commute notification. The Notifications panel distinguishes account intent from current-device setup and can restore a device subscription when browser permission is already granted. Delivery is inactive unless browser permission is granted, VAPID keys are configured, `linewatch.push.enabled` is true, and fresh source data provides an eligible event for the relevant network. Regional candidates and restoration handling are gated by fresh successful Metrolinx ingestion independently from TTC freshness. Supported rapid-transit push titles identify the TTC line or GO/UP corridor and event type; active bodies show the source start time when available. Distinct source updates to an existing disruption, including a severity escalation, create a new active delivery and re-notify the active lifecycle entry; unchanged polling snapshots remain deduplicated. Service-restored Web Push notifications are sent as separate non-silent lifecycle entries rather than replacing the active alert. Every LineWatchTO Web Push request uses high transport urgency, and the service worker requests non-silent, re-notifying, persistent display for every notification. Displayed lifecycle push entries are retained from LineWatch cleanup for the configured cleared-notification retention window, but Android/iOS browser policy can still age or remove PWA notifications.
- Planned-closure push timing uses one account-level follow-up policy shared by My Commutes and line subscriptions: Smart, Within 24 Hours, Day Of, or Announcements Only. New and meaningfully changed closure notices remain automatic when their stream and event-type filters allow them. Both planners emit one applicable timing candidate per closure evaluation, and My Commutes delivery still respects the relevant leg's Toronto-time route window.
- Opt-in schematic train markers, derived from the GTFS-RT subway arrival cache and mapped onto rapid-transit segment topology, are served at `/api/trains` and rendered on the SVG map only while the general subway operating window is open. During closed hours, markers are suppressed even if TTC continues publishing fresh subway Trip Updates.
- Production-grade observability using Grafana Cloud and a host-based Grafana Alloy collector that scrapes Spring Boot Prometheus actuator metrics, host Unix exporter metrics, Docker cAdvisor container metrics, Postgres, Redis, and ships Loki Docker container logs is implemented.
- Dependency-free portfolio performance measurement tooling records repeatable sequential API latency samples and wall-clock backend/frontend build and test timings with source, environment, workload, success, and failure metadata in local JSON and Markdown reports.
- Safe, non-public actuator exposure running on private management port 9090 inside the Docker network, and blocked by Caddy reverse-proxy rules at the edge is implemented.
- Conditionally loaded Cloudflare Web Analytics beacon script on the frontend layout when a client token is supplied is implemented.
- A cross-network design-language consistency pass is implemented for TTC and GO/UP modes. Equivalent experiences share the mature TTC presentation patterns for time/freshness vocabulary, menu structure, authored line badges, station-panel chrome, transitions, responsive layouts, cards, loading/empty/error states, and map interactions. Network-specific content and capabilities remain source-honest rather than being forced into TTC-shaped UI.
- Regional disruption overlay and map-selection refinement is implemented. Fresh regional planned closures can drive blue segment or station previews; station-only impacts are not projected across full corridors; overlapping segment lanes use deterministic severity ordering; repeated pointer activation cycles through overlapping segment or station impacts; and completed map/card selections move above other regional SVG impact layers without disrupting focused hit targets.
- Source-labeled 30-day TTC line/station and GO/UP corridor/station disruption aggregation is implemented from retained normalized alert lifecycles. Counted intervals must overlap verified polling, a GTFS-derived daily line/corridor service span, and any applicable planned-closure window. Unique service-impact time is distinct from additive incident-hours; polling and schedule-date coverage are reported separately, and confidence uses the weaker coverage source. Regional history begins accumulating from its reliability migration, so early regional results are explicitly low-confidence.
- Standalone commute-impact API, cross-network routing, and commute email notifications remain planned.

Do not claim that the visible dashboard is live unless there is a fresh successful ingestion run. Do not claim imported GTFS geometry, production geospatial matching, or Redis-backed status until those features exist in code and have passing verification. Do not claim TTC live station arrivals unless `LINEWATCH_ARRIVALS_PROVIDER=live`, a fresh TTC GTFS-RT Subway Trip Updates snapshot has been mapped through an active static GTFS import, and the returned rows are source-labeled live. Do not claim GO/UP arrivals are live unless `LINEWATCH_REGIONAL_ARRIVALS_ENABLED=true`, the backend-only Metrolinx key is configured, and the endpoint returns freshness-checked source-labeled live rows. Scheduled GO/UP rows require an active static-GTFS import and must be described as published timetable times, not realtime estimates, guaranteed departures, or physical train positions. Do not claim GO/UP estimated train markers unless `LINEWATCH_REGIONAL_TRAIN_MARKERS_ENABLED=true`, the backend-only Metrolinx key is configured, and `/api/regional/trains` returns a fresh source-labeled snapshot. Regional markers are conservative topology-projected schematic placements, not exact coordinates or physical movement. Do not claim visitor analytics or engineering telemetry shows data unless Grafana Cloud and Cloudflare Web Analytics are configured with active credentials/tokens. Do not claim estimated train markers are exact physical train positions or reflect real-time physical movement; always refer to them as estimated train markers or schematic placements. Do not claim overnight subway Trip Updates represent in-service trains; the app hides estimated markers during closed hours.
Do not claim My Commutes sends push notifications unless Web Push is configured/enabled and the notification is based on either a fresh dashboard-visible commute impact or an exact schedule-backed regional train cancellation allowed by the route's notification rule and time window. Do not claim My Commutes sends email notifications, recommends alternate routes, accounts for walking transfers, provides route review/edit, provides accessibility-personalized matching, or uses live train movement for route timing. Do not present commute extra-time ranges as precise predictions; they are confidence-labeled heuristics over the matched dashboard-visible impacts. Train cancellations do not alter the commute travel-time estimate.
Do not claim accessibility outages or surface notices send push notifications or are included in saved commute matching, segment overlays, status ratings, or reliability metrics. Do not claim surface notices are active in fallback fixture mode. Do not claim regional accessibility notices provide complete facility coverage, stable asset identity, platform-level matching, or guaranteed restoration times. Do not claim GTFS-RT service-alert records drive the map, status, saved-commute, or push paths; the enabled service-alert supplement is filtered to bus/streetcar surface notices. GTFS-RT Subway Trip Updates are used only by the opt-in live station-arrival provider.
Do not claim the TTC station-page monitor is an official, complete, or realtime station-notice API. Reviewed station notices do not affect alerts, maps, status, accessibility, My Commutes, reliability, or push notifications. Do not enable TTC website monitoring in a public environment without the required source-use approval.
Do not claim GO/UP alert status is live unless Metrolinx polling is configured and `/api/health/regional-ingestion` reports a fresh successful run. Regional service alerts are filtered and topology-projected service notices; while fresh, supported route/station/segment impacts can feed regional saved-commute matching. They remain separate from station arrivals, estimated markers, accessibility amenity reads, reliability, and push-notification inputs. Regional commute times are low-confidence topology planning estimates, not schedule-backed predictions.
Do not claim GO Train Exceptions or GO GTFS-RT TripUpdates reproduce rider-facing website notices. Those operational records may appear only as structured GO trip changes after exact active-schedule and mapped-station matching; unmatched operational rows remain internal. Fresh structured rider-alert train cancellations may appear unmatched and source-labeled, but only exact schedule-backed cancellations can annotate arrivals or match My Commutes. Train cancellations are excluded from corridor status, map overlays, delay counts, reliability incidents, and commute travel-time impacts. They can generate distinct corridor-subscription notifications and, when exactly route/time matched, My Commutes notifications; cancellation expiry never implies service restoration. The operational feeds do not provide the website card's title, explanatory prose, or publication context. Do not imply equivalent UP trip-change coverage.


Explicit GO timetable announcements (such as “Service changes start Sept. 8”) are shown as corridor-tagged Service Notices from fresh GO service-alert or GTFS-RT rail records, deduplicated across those sources. They do not infer a station-to-station span or drive current delays, map overlays, commute impacts, reliability incidents, or push candidates. Generic operational disruptions and planned closures retain their existing classification.

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
- My Commutes cards answering whether a route is affected and how the current impact changes the route's standard travel-time estimate.
- Reliability and ingestion health panels for portfolio depth.

This is an app dashboard, not a marketing landing page. The first screen should always be the usable product.

## Stack

Frontend:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS is available, but plain CSS in `frontend/src/app/globals.css` is also used.
- Node's built-in test runner is used for fixture tests.

Mobile:

- Expo SDK 57 with Continuous Native Generation.
- React Native and TypeScript.
- Expo Router.
- TanStack Query with AsyncStorage persistence.
- React Native SVG, Gesture Handler, and Reanimated.
- Jest/React Native Testing Library and Maestro.

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
mobile/         Expo/React Native Android and iOS prototype
infra/          Production infrastructure image definitions
docs/           Design specs and implementation plans
AGENTS.md       Shared agent guidance
GEMINI.md       Copy of this guidance for Gemini and antigravity-cli style tools
README.md       Human-facing project overview and setup guide
```

## Core Commands

Run commands from the repository root unless noted.

Frontend:

```bash
node scripts/tests/performance-measurements.test.mjs
npm --prefix frontend run test:fast
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run dev
scripts/dev-live-frontend.sh
scripts/dev-alert-scenario-frontend.sh all-alert-types
scripts/dev-regional-alert-scenario-frontend.sh all-alert-types
npm --prefix frontend run test:smoke
npm --prefix frontend run test:e2e
npm --prefix frontend run test:e2e:full
npm --prefix frontend run test:visual
npm --prefix frontend run test:browser-compat
```

Mobile:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
```

Backend:

```bash
mvn -f backend/pom.xml test
mvn -f backend/pom.xml spring-boot:run
scripts/dev-live-backend.sh
scripts/dev-alert-scenario-backend.sh all-alert-types
scripts/dev-regional-alert-scenario-backend.sh all-alert-types
```

Infrastructure:

```bash
node scripts/measure-portfolio-performance.mjs --help
docker compose up -d postgres redis
docker compose down
scripts/prod-build-push.sh
scripts/prod-deploy.sh <full-git-sha>
scripts/prod-compose.sh ps
scripts/prod-backup-postgres.sh
scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-compose.sh ps
scripts/staging-down.sh
LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
```

Health check:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/ingestion
curl http://localhost:8080/api/health/schedule
curl http://localhost:8080/api/health/station-notices
curl http://localhost:8080/api/health/regional-ingestion
```

## Verification Policy

Do not call work complete until relevant checks have been run and read.

For frontend-only changes, run:

```bash
npm --prefix frontend run test:fast
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

For substantial frontend changes, also run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
npm --prefix frontend run test:e2e
```

For visual changes, also run:

```bash
npm --prefix frontend run test:visual
```

For mobile changes, run:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
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
- Staging is separate from production. Do not point staging scripts at `.env.production`, `.env.release`, production volumes, or production image tags. Do not copy production secrets into `.env.staging`.

## Frontend UX Rules

- Build the app experience directly; do not add a landing page.
- Use **My Commutes** as the user-facing feature name everywhere. Keep `saved commute` only for internal code, persistence, API, and historical implementation terminology.
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
- Opt-in backend-only polling of five Metrolinx GO/UP rider-alert collections plus GO Train Exceptions and GO GTFS-RT TripUpdates, with separate source-scoped alert and operational staging, reviewed normalization of supported rail alerts, per-collection run health, freshness gating, and `/api/health/regional-ingestion`.
- Freshness-gated, exact-static-schedule matching for structured GO operational cancellations and stop changes through `/api/regional/trip-changes`, plus source-labeled structured rider-alert train cancellations. Only schedule-backed cancellations annotate arrivals or match My Commutes. Distinct observed train cancellations are recorded as a separate coverage-labeled 30-day Reliability Analytics insight; they remain outside regional reliability incidents and duration metrics, dashboard impacts, maps, status, delay counts, and travel-time estimates, but can generate separately filtered corridor or exact route/time-matched My Commutes notifications.
- Raw staging for route and accessibility alert records.
- Supported subway/LRT delay, suspension, and planned-closure normalization.
- Persisted route-alert impact kind so ordinary delays are not grouped as Reduced Speed Zones.
- `/api/alerts?type=delay` returns ordinary delay cards separately from `/api/alerts?type=slowdown` Reduced Speed Zone groups.
- Active alert, delay, planned-closure, and Reduced Speed Zone DTOs expose Started and Updated timestamps from normalized source timing.
- Elevator and escalator outage normalization with seeded station links where names resolve.
- Complete station-line tagging with reviewed line-specific wheelchair/elevator metadata and authored station-detail icons.
- Fresh directly linked TTC station alerts and elevator/escalator outages in `/api/stations/{id}`, suppressed when ingestion is stale.
- Source-ID upserts, alert snapshots, ingestion-run tracking, and `/api/health/ingestion`.
- Source-labeled TTC scheduled service imports for rapid-transit arrivals, automatic GTFS schedule refresh when enabled, `/api/health/schedule`, and an opt-in TTC GTFS-RT Subway Trip Updates live-arrival provider with scheduled fallback.
- Bounded-memory automatic GTFS schedule refresh utilizing a two-pass streaming parser and transactional 1,000-row database batching to operate within a 1 GB heap.
- Schedule refresh run lifecycle persistence in `ingestion_runs` with `run_type = 'gtfs-schedule'`.
- Exposing the latest schedule refresh run status, timestamps, and error messages via `/api/health/schedule` independently of the active schedule's coverage.
- In-memory auth endpoint rate limiting and server-side length caps for account and saved-commute input.
- Live Alerts reduced-speed records now derive explicit cardinal direction from TTC wording.
- `Both ways` and `both ways` source directions resolve to bidirectional travel with line-aware cardinal labels.
- Map overlays expose layered impact metadata and project onto adjacent rapid-transit topology links.
- Station-node impacts are exposed for single-station alert rings.
- Ordinary overlay links resolve from SVG station-dot anchors.
- Nonlinear overlays resolve from the authored hidden segment-guides-layer.
- Opposite-direction Reduced Speed Zone records merge into one bidirectional effect and grouped card.
- Directionless Reduced Speed Zone records render bidirectionally without inventing a direction label.
- `/api/performance` exposes source-labeled official TTC.ca on-time and elevator/escalator status metrics with a low-frequency refresh guard and stale last-good fallback when TTC.ca cannot be parsed or fetched.
- Redis-backed dashboard caching is implemented for current status, map, alerts, reliability analytics, ingestion health, and performance reads. Reliability line/corridor and station aggregates use normalized network-scoped keys with a configurable one-minute default TTL. Cache misses and Redis outages fall back to live/database computation, and alert ingestion success evicts dashboard cache keys.

The backend should eventually own:

- Additional planned-closure source ingestion if needed beyond the live-alert feed.
- TTC Reduced Speed Zones webpage ingestion if needed beyond the live-alert feed.
- Alert-to-line/station/segment impact matching.
- Commute impact matching.
- User-facing live status reads.
- Exact live physical on-map train tracking.

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
GET  /api/health/schedule
GET  /api/health/regional-ingestion
```

The current backend implements seeded-demo dashboard boundaries (`/api/map`, `/api/status`, `/api/alerts`, `/api/stations`), the network-scoped `/api/dashboard?network=ttc|regional` boundary, service health (`/api/health`), opt-in TTC and Metrolinx alert ingestion pipelines with separate freshness health endpoints, schedule import health (`/api/health/schedule`), and official performance metrics (`/api/performance`). Keep fixture mode available for demos and tests.

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

1. Revisit cross-network routing and optional email notifications only with a concrete product need.

## Agent Handoff Notes

If you are antigravity-cli, Gemini, Codex, or another coding agent:

- Read this file, the README, and the relevant docs under `docs/superpowers/` before major changes.
- State whether you are touching frontend, backend, docs, or infrastructure.
- Run the smallest meaningful failing test before behavior changes when practical.
- Run verification before claiming success.
- Summarize changed files and commands run.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/` contains generated TTC-shaped alert scenario feeds for dev/test coverage.
- `scripts/alert-scenario-catalog.mjs` is the source of truth for those generated fixtures; run `node scripts/generate-alert-scenarios.mjs` after editing it.
- `scripts/dev-alert-scenario-backend.sh <scenario-name>` runs the backend against a local scenario feed for manual browser testing.
- `scripts/dev-alert-scenario-frontend.sh <scenario-name>` starts the matching scenario frontend with a scenario-specific browser tab title.
- The shared `all-alert-types` backend scenario serves both TTC-shaped and Metrolinx-shaped regional fixtures; TTC-focused scenarios disable regional ingestion so they cannot silently display configured live Metrolinx data.
- Scenario records may be synthetic when captured public TTC samples are unavailable; do not describe scenario data as live TTC service.
- `backend/src/test/resources/fixtures/metrolinx-alert-scenarios/` contains generated GO/UP source-shaped scenario feeds. `scripts/regional-alert-scenario-catalog.mjs` is their source of truth; regenerate them with `node scripts/generate-regional-alert-scenarios.mjs`.
- `scripts/dev-regional-alert-scenario-backend.sh <scenario-name>` and `scripts/dev-regional-alert-scenario-frontend.sh <scenario-name>` run the isolated regional harness. Reviewed samples and synthetic gap-fill records are marked separately; never describe either as current public Metrolinx service information.
- Do not overclaim features that are only represented by fixtures.
- Station arrivals are scheduled rapid-transit estimates by default. With `LINEWATCH_ARRIVALS_PROVIDER=live`, fresh mapped TTC GTFS-RT Subway Trip Updates can produce source-labeled live station arrival rows, with scheduled fallback for missing/stale rows. Surface connections are outside this slice. Do not claim estimated train markers are exact physical train positions, and do not claim live train movement-based route timing.
