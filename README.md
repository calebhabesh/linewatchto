# LineWatchTO

LineWatchTO is an unofficial transit reliability dashboard for TTC subway/LRT and GO/UP rail riders. The goal is to combine source-linked service alerts, planned closures, GTFS route data, My Commutes impact checks, and historical alert snapshots into a map-first dashboard that quickly answers:

> Is my route affected now, later today, or this weekend?

The project is intentionally scoped as a full-stack portfolio build: practical enough to demo, but engineered with real backend, database, geospatial, cache, testing, and deployment concerns.

## Current Status

The current app is a full-stack dashboard with graceful local-fixture fallback. Next.js fetches Spring Boot dashboard boundaries when the backend is available and falls back to typed local fixtures when a required request fails. The backend can poll and normalize TTC Live Alerts and the Metrolinx Open API when each source is explicitly enabled. User-facing dynamic reads use source records only while that source's latest successful ingestion run is fresh; stale live rows are suppressed instead of remaining visible.

Implemented now:

- Dark, map-first Next.js dashboard.
- Cross-network design-language consistency for equivalent TTC and GO/UP experiences: shared time/freshness and fallback vocabulary, menu and responsive navigation patterns, authored line badges, station-panel chrome and transitions, impact cards, loading/empty/error hierarchy, and map interaction feedback. The desktop and mobile notices destination is network-scoped: TTC shows streetcar/bus notices and GO/UP shows fresh Metrolinx Information, Marketing, and bus-only GO GTFS-RT records.
- GO/UP network mode with a network-scoped TTC / GO & UP selector, a per-device default-map preference, a custom interactive regional schematic, all eight rail corridors, 72 logical stations, and all 74 adjacent route links. Opt-in backend-only Metrolinx Open API polling requires the GO service-alert and UP Express GTFS-RT alert collections and independently attempts GO information, marketing, GTFS-RT alerts, Train Exceptions, and GO GTFS-RT TripUpdates. Rider-alert collections are raw-staged under separate source namespaces; Train Exceptions and TripUpdates are retained in a separate operational store. An unavailable supplemental collection does not fail the poll or deactivate its last-good rows, and `/api/health/regional-ingestion` reports every collection independently. Reviewed mapped GO service-disruption records and supported UP Express records can drive regional line status, alert cards, affected route links, station rings, and saved-commute disruption matching through `GET /api/dashboard?network=regional`. Fresh GO Information and Marketing rows plus bus-only GO GTFS-RT alert rows are exposed in the regional notices panel; GO GTFS-RT rail alerts remain outside that informational panel. Fresh operational rows can now produce purpose-built GO trip changes only when they match exactly one active static-GTFS trip and mapped station sequence: supported cancellations, skipped stops, and explicitly identified added stops appear on matching arrival tiles, in regional station details, and under the Trip Changes view inside GO/UP Notices. Duplicate Train Exception and TripUpdate signals are merged; ambiguous and unmatched rows remain internal audit data. These structured trip changes do not become corridor alerts, map overlays, commute impacts, reliability incidents, or notification candidates, and they do not reproduce GO website prose. Stale, disabled, or unavailable ingestion suppresses regional commute impacts, notices, and trip changes. Independently opt-in regional station arrivals use Metrolinx GO Next Service train rows and the dedicated UP Express GTFS-RT TripUpdates feed through a purpose-built station endpoint, with source freshness checks, short backend caching, and explicit unavailable states. Fresh GO amenity records for elevator/escalator disruptions drive the network-scoped accessibility drill-down and regional station-detail outage rows when station and corridor codes map cleanly to the reviewed catalog. The regional map reuses the TTC map's interaction patterns and can preview account-owned GO/UP commute paths. Regional overlap handling uses deterministic severity lanes, repeated pointer activation to cycle segment or station impacts, and foreground promotion for completed map or card selections; station-only impacts are not expanded to full corridors, and fresh planned closures can drive blue map previews. Station search, station details, line legend actions, reliability analytics, status copy, and mobile inspection follow the selected network. My Stations and My Commutes are account-wide collections with All/TTC/GO & UP filters; opening an item switches to its network before focusing the corresponding map. Reduced Speed Zones remain absent in regional mode. Regional notices and trip changes are informational-only: they do not drive service status, map overlays, My Commutes, reliability, or push notifications, and Metrolinx API coverage does not guarantee parity with every notice shown on the GO or UP websites. Saved-station and saved-commute identities include the network so shared logical station IDs cannot collide. TTC remains the default.
- Opt-in estimated train markers can display schematic train blips on the TTC-style map when the live subway GTFS-RT arrival provider has a fresh mapped snapshot. These markers are inferred from trip updates, line topology, and segment travel-time estimates; they are not physical train positions.
- Network-scoped accessibility outages panel with elevator and escalator drill-downs grouped by TTC line or GO/UP corridor and station, showing update times, station detail links, and custom icons.
- Searchable, network-scoped service notices panel with debounced route/station search. TTC exposes detour, bypass, and service-change filters; GO/UP provides separate Service Notices and Trip Changes views. Service Notices adds All services, Train, and Bus selectors over fresh Metrolinx Information, Marketing, and bus-only GO GTFS-RT notices. Trip Changes searches fresh, confidently schedule-matched GO operational cancellations and stop changes by train, corridor, or station. Supplemental GO GTFS-RT rail alerts remain excluded from both informational views.
- Unified global search with grouped results for TTC and GO/UP lines and stations, dashboard-visible rapid-transit alerts, account-owned saved stations and commutes, searchable Streetcar & Bus notices, and core app destinations. Both station catalogs remain searchable from either map mode; shared logical IDs stay network-scoped, the current map wins equal-result ties, and selecting a station on the other network switches maps before focusing its detail panel. Results otherwise hand off to the existing detail view or specialized submenu, where local filters remain available. Surface notice results remain unavailable in fixture mode, and account-owned result groups appear only when those items have been loaded for the signed-in account.
- Overnight subway-closed screen that hides the feed during general non-operating hours while allowing a map peek for current overlays and station accessibility details.
- Custom semantic SVG-backed subway/LRT network map from `frontend/public/assets/linewatch/ttc-subway-map-custom.svg`.
- TTC-style line colors for Lines 1, 2, 4, 5, and 6.
- Red suspended-service overlays.
- Orange ordinary-delay overlays with a static effect.
- Explicit Reduced Speed Zone overlays with directional chevrons.
- Separate Delays and Reduced Speed Zones submenu cards.
- Clickable/tappable affected map segments and single-station impact rings that open the corresponding submenu cards.
- Active alert cards with affected segments, shuttle indicators, Started timing, and Updated timing.
- Delay cards with Started based on `activePeriod.start` and Updated based on TTC `lastUpdated`.
- Reduced Speed Zone cards with Cause, Resolution, and available speed/track metadata.
- Planned closure cards with map preview highlighting plus structured Toronto-time closure hours and closure nights/dates derived from TTC active periods; clearly incomplete trailing time fragments in TTC titles are omitted from the display copy.
- Legend SVG icons for Lines 1, 2, 4, 5, and 6.
- Account-backed, cross-map My Commutes collection with All/TTC/GO & UP filtering, explicit network identity, automatic network switching for map review, weighted default rapid-transit route matching, route endpoint/label/return-leg editing, stop-list and map-path review, optional return-trip monitoring, direction-aware Reduced Speed Zone matching, dashboard-visible impact summaries, standard-vs-impacted travel-time estimates with confidence labels, and per-route notification rules with independent outbound/return day and time schedules and event types across the complete route. Each route remains wholly TTC or wholly regional; mixed-network riders save one route for each system. The UI identifies these as rider-selected monitored routes, not fastest-route recommendations. Route edits recalculate that network's default path and disruption matches while preserving the route's notification rule. Route filters change monitored status and notification relevance, but current ignored route conditions still contribute to the absolute travel-time estimate; upcoming closures remain visible without changing that estimate until their active window begins.
- Network-scoped regional My Commutes with GO/UP route computation over the reviewed 72-station/74-link schematic topology, shared-station and Union transfers, route endpoint/label/return-leg editing, map path review, low-confidence planning-time estimates, freshness-gated corridor, segment, and station disruption matching, and granular per-route Web Push rules.
- Account-backed, cross-map My Stations watchlist with All/TTC/GO & UP filtering, network-qualified station identity and actions, automatic network switching for station/impact drill-downs, save/remove actions in station details and global search, searchable/filterable/sortable rows, expandable fresh station-impact and accessibility-outage summaries, source-labeled compact station arrivals, and consistent desktop Account/mobile More navigation. Riders can pin a station's TTC line or GO/UP corridor arrivals to the top using a per-device preference that is shared by station detail and My Stations. My Stations does not send push notifications.
- Account-backed Web Push notification subscriptions and preferences for TTC and GO/UP My Commutes impacts plus opt-in TTC line and GO/UP corridor subscriptions. My Commutes notifications can be narrowed per route; delivery is opt-in and requires browser permission, a browser that supports PWA Web Push, configured VAPID keys, `LINEWATCH_PUSH_ENABLED=true`, fresh dashboard-visible impacts from the relevant network, and a matching route or line/corridor rule. Regional active, updated, and restored notifications reuse the existing lifecycle observation and deduplication path.
- Account sign-in supports optional Google sign-in when a Google OAuth web client ID, client secret, and redirect URI are configured, while retaining email/password registration, explicit Google linking for existing password accounts, password reset through emailed reset links when SMTP is configured, local/dev reset-token fallback, and demo login.
- Official TTC.ca performance metrics panel for current on-time and elevator/escalator status, source-labeled with the TTC.ca updated timestamp, daily refresh guard, and stale last-good fallback.
- Source-labeled 30-day TTC line/station and GO/UP corridor/station disruption summaries derived from retained normalized alert lifecycles. The UI reports incident counts, active incidents, observed disruption minutes, median completed duration, observation coverage, and low/medium/high confidence without inventing a reliability score.
- Redis-backed dashboard cache for status, map, alerts, ingestion health, and TTC performance reads, with database/live fallback when Redis is unavailable.
- Ingestion/system health panel in fixture mode.
- High-contrast display toggle.
- Independent reduced-motion and dot-background toggles, with a plain black or white background option.
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
- Source-labeled station arrivals. The default provider uses TTC scheduled service when a merged GTFS schedule import is active. The opt-in `live` provider polls TTC GTFS-RT Subway Trip Updates, maps `stop_id` values through the active static GTFS import, and falls back to scheduled rows when the live feed is stale, missing a direction, or missing a line. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data.
- PostGIS-enabled Flyway schema for stations, transit lines, line segments, alerts, alert-segment links, snapshots, and ingestion runs.
- Dashboard API boundaries for `/api/map`, `/api/status`, and `/api/alerts`, with fixture fallback when backend data is unavailable.
- Network-scoped `/api/dashboard?network=ttc|regional`, including the complete GO/UP static catalog and freshness-gated Metrolinx rail impacts.
- Next.js Server Component dashboard loading with complete local-fixture fallback.
- Playwright Chromium smoke tests for seeded API, fallback rendering, delay overlay clicks, station-ring interactions, and station accessibility details on desktop and mobile viewports.
- Opt-in scheduled polling for the official TTC Live Alerts feed at `https://alerts.ttc.ca/api/alerts/live-alerts`.
- TTC GTFS-RT bus and streetcar service-alert ingestion supplements surface notices by default when alert ingestion runs. The supplement fetches the bus and streetcar feeds, filters out rapid-transit GTFS-RT records, and does not feed subway/LRT map overlays, status, saved-commute matching, or push notifications.
- Raw staging for route and accessibility source records so unsupported records are retained for later analysis.
- Normalization and source-ID upserts for supported subway/LRT ordinary delays, suspensions, Reduced Speed Zones, and planned closures.
- Elevator and escalator outage normalization with station links where TTC station names resolve.
- Alert snapshots for new, changed, deactivated, and reactivated normalized route alerts.
- Network-scoped in-app TTC and GO/UP service alert lifecycle history for Today, 7 days, and 30 days, showing alert openings, meaningful updates, and clearances based on LineWatch snapshot records, with a 5,000-event API cap per request. The visible history follows the active map mode.
- Durable ingestion-run tracking and `/api/health/ingestion`.
- Backend-only Metrolinx developer-key configuration, source-scoped raw staging for five GO/UP rider-alert collections, separate operational staging for GO Train Exceptions and GO GTFS-RT TripUpdates, per-collection run health, normalized supported rail-alert persistence, source-scoped deactivation, dashboard freshness gating, and `/api/health/regional-ingestion`.
- Scheduled operational cleanup for inactive GTFS schedule imports, old ingestion-run rows, and stale inactive TTC and Metrolinx source-staging rows. Alert history snapshots are retained.
- Persisted route-alert impact kind so ordinary delays are not categorized as Reduced Speed Zones.
- Live Alerts reduced-speed records now derive explicit cardinal direction from TTC wording.
- `Both ways` alert directions are interpreted bidirectionally with line-aware cardinal labels.
- Stale successful ingestion runs no longer drive visible alert cards, line status, map overlays, or dynamic station detail rows after the dashboard freshness window expires.
- Map overlays expose layered impact metadata and project onto adjacent rapid-transit topology links.
- Ordinary overlay links resolve from SVG station-dot anchors.
- Nonlinear overlays resolve from the authored hidden segment-guides-layer.
- Opposite-direction Reduced Speed Zone records merge into one bidirectional effect and grouped card.
- Directionless Reduced Speed Zone records render bidirectionally without inventing a direction label.
- Nightly closure active-window gating derived from TTC parent/child periods. A closure remains in the Planned Closures timeline throughout its current or future schedule; during an active child window it also appears in Active Alerts, marks the line `Closure active`, affects matching commutes, and renders a red current-closure map overlay with the active-alert warning identity. When TTC publishes the active child as a standalone route alert, LineWatchTO links it by the parent period's exact source ID, uses the child's identity for the single current map impact, and provides a `View Details` link back to the canonical planned closure. If TTC does not publish a standalone child, LineWatchTO projects the canonical closure into the active view for the effective window while retaining that same active-alert presentation.

Not implemented yet:

- TTC alert polling remains opt-in by default; use the live backend dev script for fresh alert cards and map overlays.
- TTC Reduced Speed Zones webpage ingestion remains unimplemented.
- Exact live physical on-map train position tracking remains unimplemented. The on-map train markers are schematic estimates inferred from arrival predictions.
- Regional commute baseline times are topology planning estimates, not timetable predictions, and cross-network TTC-to-GO/UP routing is not implemented. Regional accessibility notices do not establish complete facility coverage or platform-level asset identity and do not send push notifications. Regional arrivals are on-demand realtime estimates, not guaranteed departure times. Regional estimated train markers are freshness-gated topology-projected schematic placements, not exact train locations or physical movement.
- The arrival provider architecture supports live, scheduled, unavailable, and demo status states.
- Standalone commute-impact endpoint, commute email notifications, alternate-route suggestions, and accessibility-personalized commute matching.
- Line-wide Web Push subscriptions are implemented for Lines 1, 2, 4, 5, and 6, but they are opt-in and filtered by selected line, event type, and one account-level planned-closure follow-up policy. Reduced Speed Zone line-wide alerts default on for new notification preferences. Existing active Reduced Speed Zones are recorded silently when a line stream becomes eligible, new Reduced Speed Zones send one active notification, and observed Reduced Speed Zones can send a clearance when fresh dashboard data shows they are gone.
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

Production is designed for one Oracle Cloud Always Free Ampere VPS running Docker Compose. WireGuard, Docker Engine, and host firewall rules remain host-managed. Compose runs Caddy, the Next.js frontend, the Spring Boot backend, PostgreSQL/PostGIS, and Redis.

Production application images are built on the development server, published as immutable ARM64 images to GHCR, and selected on the VPS through `.env.release`. The VPS should not run `docker compose build` or `up --build`.

The production database image is built from the official multi-architecture PostgreSQL 17 image with PostGIS installed from PostgreSQL's Debian packages. This avoids the AMD64-only official `postgis/postgis` image on the ARM64 VPS.

Recommended production domain shape for `linewatchto.ca`:

```text
linewatchto.ca      Caddy -> Next.js frontend
www.linewatchto.ca  Caddy -> Next.js frontend
linewatchto.ca/api  Caddy -> Spring Boot backend
api.linewatchto.ca  Caddy -> Spring Boot backend
```

Only these ports should be public in OCI ingress:

```text
80/tcp       HTTP for Caddy certificate issuance and redirect
443/tcp      HTTPS for the app and API
51820/udp    WireGuard listener
```

Keep `22/tcp` open only until WireGuard SSH has been verified after a VPS reboot. Then remove public SSH ingress and administer the VPS through the VPN.

Point the `linewatchto.ca`, `www.linewatchto.ca`, and `api.linewatchto.ca` DNS records at the VPS. If Cloudflare is authoritative, start with DNS-only records while validating Caddy certificate issuance, then enable proxying only if desired.

See [docs/production-vps.md](file://~/dev/ttc-reliability-navigator/docs/production-vps.md) for detailed hosting and server setups, and [docs/observability.md](file://~/dev/ttc-reliability-navigator/docs/observability.md) for the monitoring, metrics, Loki logs, and Grafana Cloud alerting configuration. For traffic-spike preparation, Cloudflare cache rules, surge-mode dashboard refresh, and production verification, see [docs/traffic-spike-runbook.md](docs/traffic-spike-runbook.md).

For the separate AWS learning profile, see [infra/aws-lab/README.md](infra/aws-lab/README.md). The AWS lab is an ephemeral Terraform-managed environment for interview and infrastructure practice; production remains on the Oracle Cloud Always Free VPS.

Create the production env file on the VPS:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace the example database password and configure SMTP or Web Push secrets only when those features are intentionally enabled. Do not commit `.env.production`.

Bootstrap GHCR write access on the development server:

```bash
export CR_PAT=your_write_packages_token
printf '%s' "$CR_PAT" | docker login ghcr.io -u calebhabesh --password-stdin
unset CR_PAT
```

Build and publish from a clean development-server checkout:

```bash
scripts/prod-build-push.sh
```

The first command-line push creates private GHCR packages. Link all three packages to this repository, change them to public, and verify anonymous reads before deploying the VPS without registry credentials:

```bash
docker logout ghcr.io
docker pull ghcr.io/calebhabesh/linewatch-frontend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-backend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-postgres:<full-git-sha>
```

Deploy the printed full Git SHA on the VPS. The first deployment does not run a backup because no production database exists yet:

```bash
git pull --ff-only
scripts/prod-deploy.sh <full-git-sha>
```

After a healthy deployment, the deploy script removes Docker images that are no longer referenced by a container. This prevents immutable SHA-tagged releases from filling the VPS boot volume. Running images and persistent volumes are not removed; a rollback pulls its requested public GHCR image again when it is no longer cached locally. Set `LINEWATCH_DEPLOY_PRUNE_IMAGES=false` only when temporarily retaining unused local images for troubleshooting.

For later deployments, back up first:

```bash
git pull --ff-only
scripts/prod-backup-postgres.sh
scripts/prod-deploy.sh <full-git-sha>
```

Routine production Compose commands:

```bash
scripts/prod-compose.sh config
scripts/prod-compose.sh ps
scripts/prod-compose.sh logs -f caddy frontend backend
```

Rollback reuses the same health-gated deploy path:

```bash
scripts/prod-deploy.sh <previous-full-git-sha>
```

Flyway migrations are not automatically reversed. Review schema compatibility before rolling back across database changes, or restore a known-good database backup.

Only Caddy publishes host ports. The frontend, backend, database, and Redis are reachable only through the private Compose network.

Check health:

```bash
curl https://linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health/ingestion
curl https://api.linewatchto.ca/api/health/schedule
curl https://api.linewatchto.ca/api/health/regional-ingestion
```

Production backend settings should include:

```bash
LINEWATCH_AUTH_SECURE_COOKIE=true
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://linewatchto.ca,https://www.linewatchto.ca
LINEWATCH_AUTH_TRUSTED_PROXY_CIDRS=127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://linewatchto.ca
LINEWATCH_INGESTION_ALERTS_ENABLED=true
LINEWATCH_ARRIVALS_ENABLED=true
LINEWATCH_ARRIVALS_PROVIDER=scheduled
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14
```

The backend includes an in-process GTFS refresh job. When enabled, it downloads and imports the public merged TTC schedule only when no active import exists, the import is expired, or it is within the configured expiry threshold. These arrivals remain scheduled estimates, not live train predictions.

The backend also runs a conservative maintenance cleanup job by default. It removes disposable demo accounts after their only session expires, keeps the active GTFS schedule import plus one inactive backup import, prunes old ingestion-run rows after 90 days while preserving the latest run for each type, and prunes inactive TTC and Metrolinx alert/operational source-staging rows after 90 days. Alert history snapshots are not pruned. Override with:

```bash
LINEWATCH_MAINTENANCE_CLEANUP_ENABLED=true
LINEWATCH_MAINTENANCE_CLEANUP_FIXED_DELAY=PT24H
LINEWATCH_MAINTENANCE_INGESTION_RUN_RETENTION=P90D
LINEWATCH_MAINTENANCE_ALERT_SOURCE_RECORD_RETENTION=P90D
LINEWATCH_MAINTENANCE_RETAIN_INACTIVE_GTFS_IMPORTS=1
```

To enable live station arrivals, keep the scheduled GTFS refresh/import active and set:

```bash
LINEWATCH_ARRIVALS_PROVIDER=live
LINEWATCH_ARRIVALS_LIVE_GTFS_RT_URL=https://gtfsrt.ttc.ca/trips/subway?format=text
LINEWATCH_ARRIVALS_LIVE_GTFS_RT_FIXED_DELAY=PT1S
LINEWATCH_ARRIVALS_TRAIN_MARKER_HORIZON=PT20M
```

Live rows are shown only when the GTFS-RT Subway Trip Updates feed is fresh and the active static GTFS import can resolve the feed `stop_id` values to LineWatch stations. Missing directions or missing lines fall back to source-labeled scheduled service.

Account auth endpoints have a small in-memory rate limiter for login, register, demo login, password-reset request, and password-reset confirmation. Keep it enabled in production, but also use your edge/provider rate-limit rules because the in-app limiter is per backend instance. Forwarded client addresses are accepted only when the immediate peer belongs to `LINEWATCH_AUTH_TRUSTED_PROXY_CIDRS`; the resolver walks `X-Forwarded-For` from the nearest hop and recognizes `CF-Connecting-IP` only when the nearest public proxy is in Cloudflare's configured CIDRs. The defaults trust loopback, private container networks, and Cloudflare's published ranges. Narrow either CIDR list if the deployment uses fixed proxy addresses.

Each public demo login receives a separate disposable account and session. Demo visitors can interact with My Commutes and My Stations without sharing account-owned state; logout removes the disposable account immediately, and maintenance removes abandoned accounts after session expiry.

For Resend password-reset email, you can use `linewatchto.ca` now that you own the domain. Resend requires a verified domain before SMTP sending. Add `linewatchto.ca` or a sending subdomain such as `mail.linewatchto.ca` in Resend, publish the DKIM/SPF/DMARC DNS records Resend shows, then configure Spring Mail:

```bash
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=true
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@linewatchto.ca
SPRING_MAIL_HOST=smtp.resend.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=resend
SPRING_MAIL_PASSWORD=your-resend-api-key
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
```

If you verify `mail.linewatchto.ca` instead of the root domain, use an address under that subdomain, for example `no-reply@mail.linewatchto.ca`. Do not use `calebhabesh.com` for LineWatchTO production reset emails unless you intentionally want reset links and sender reputation tied to your personal domain.

### Feedback Channel

LineWatchTO can accept viewing-only product feedback through `POST /api/feedback`.
The form does not collect a reply email and the backend does not persist feedback in the database.
When feedback email delivery is unavailable, the frontend offers a prefilled email-app fallback to `feedback@linewatchto.ca`.

Recommended inbox setup:

1. Route `feedback@linewatchto.ca` to the owner Gmail inbox with Cloudflare Email Routing or the current domain email provider.
2. In Gmail, create a filter for `to:feedback@linewatchto.ca`.
3. Apply a label such as `LineWatchTO / Feedback`.
4. Keep early feedback in the inbox until volume justifies archiving it automatically.

Backend feedback email settings:

```bash
LINEWATCH_FEEDBACK_ENABLED=true
LINEWATCH_FEEDBACK_FROM=no-reply@linewatchto.ca
LINEWATCH_FEEDBACK_TO=feedback@linewatchto.ca
LINEWATCH_FEEDBACK_RATE_LIMIT_MAX_REQUESTS=5
LINEWATCH_FEEDBACK_RATE_LIMIT_WINDOW=PT15M
```

These settings use the same Spring Mail SMTP configuration described for password reset email.
Use a LineWatch-owned sender such as `no-reply@linewatchto.ca` or `no-reply@mail.linewatchto.ca`.
Do not commit SMTP usernames, passwords, API keys, app passwords, or Gmail credentials.

Frontend support-link setting:

```bash
NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=https://ko-fi.com/linewatchto
```

Production builds default to the public Ko-fi profile URL for the project account.
Set this value only when you need to override that URL.
If the value is blank, the feedback panel hides the support action.
The in-app button is labeled `Support LineWatchTO` and avoids donation, money, tip, or coffee wording.

Optional Google sign-in configuration:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=true
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=google-oauth-web-client-id-from-google-cloud-console
LINEWATCH_AUTH_GOOGLE_CLIENT_SECRET=google-oauth-web-client-secret-from-google-cloud-console
LINEWATCH_AUTH_GOOGLE_REDIRECT_URI=https://linewatchto.ca/api/auth/google/callback
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
LINEWATCH_AUTH_GOOGLE_AUTHORIZATION_URI=https://accounts.google.com/o/oauth2/v2/auth
LINEWATCH_AUTH_GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
```

Use a Google OAuth Web application client. Configure Authorized redirect URIs for each environment, for example `http://localhost:3000/api/auth/google/callback`, `https://staging.linewatchto.ca/api/auth/google/callback`, `https://linewatchto.ca/api/auth/google/callback`, and `https://www.linewatchto.ca/api/auth/google/callback` if the `www` host serves the app. The custom frontend button starts the backend OAuth redirect flow; the backend exchanges the authorization code, verifies the returned Google ID token, and still creates its own HttpOnly `linewatch_session` cookie. Google sign-in is optional; when it is disabled or unconfigured, the UI falls back to email/password and demo login.

Existing email/password accounts are not auto-linked by matching email during Google sign-in. A signed-in user links Google from the account menu, which runs the same OAuth redirect flow and requires the Google email to match the current LineWatch account email. This preserves My Commutes and push preferences on the original account and avoids duplicate same-email accounts.

Run the deployment smoke checker after DNS and TLS are working:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Create a database backup on the VPS:

```bash
scripts/prod-backup-postgres.sh
```

Restore a backup by piping it into `psql` inside the Postgres container:

```bash
gzip -dc tmp/prod-backups/linewatch-postgres-YYYYMMDDTHHMMSSZ.sql.gz | \
  scripts/prod-compose.sh exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## On-Demand Staging

For week-long feature validation on the development server, use the staging Compose stack. It builds local images from the current checkout and uses isolated staging volumes, env files, and project names.

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-down.sh
```

Use `scripts/staging-reset.sh` only when you intentionally want to delete staging volumes:

```bash
LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
```

See `docs/staging.md` for Cloudflare Tunnel and Cloudflare Access setup notes.


## Frontend

Run the dashboard:

```bash
scripts/dev-live-frontend.sh
```

Then open:

```text
http://localhost:3000
```

Plain `npm --prefix frontend run dev` still works. The helper name is clearer
when several LineWatchTO tabs are open, and it sets the local browser title to
`LineWatchTO Dev`. By default, the helper also opts the browser into local dev
account auto-login. With `scripts/dev-live-backend.sh` running, localhost signs
into `dev@linewatch.local` through the real backend auth/session endpoints and
opens account-backed features such as My Commutes without a staging deploy.
Set `NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN=false` before running the
frontend helper to disable the shortcut.

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
scripts/dev-live-backend.sh
```

The same helper reads ignored `.env.local` configuration for optional Metrolinx polling. Keep the developer key backend-only:

```bash
LINEWATCH_INGESTION_METROLINX_ENABLED=true
LINEWATCH_INGESTION_METROLINX_API_KEY=your_metrolinx_developer_key
LINEWATCH_REGIONAL_ARRIVALS_ENABLED=true
LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_ENABLED=true
LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_REFRESH_ENABLED=true
LINEWATCH_REGIONAL_TRAIN_MARKERS_ENABLED=true
```

With those values in `.env.local`, `scripts/dev-live-backend.sh` polls GO service, information, and marketing alerts; GO and UP Express GTFS-RT alert feeds; GO Train Exceptions; and GO GTFS-RT TripUpdates. Every identified rider alert is raw-staged, while exceptions and TripUpdate entities use the separate operational store; only reviewed supported rail alerts are normalized for the dashboard. The profile also enables on-demand station estimates from GO Next Service and UP Express TripUpdates, imports the public GO/UP schedules as fallback, and enables freshness-gated schematic regional markers from the dedicated GO/UP VehiclePosition feeds. The key is added only to backend-to-Metrolinx requests and is never returned by the API or included in frontend configuration. Static schedule import does not require the developer key.

This dev helper also enables local password-reset links by default. It binds the backend to `127.0.0.1` and returns a short-lived reset token to the frontend for existing local accounts so the `Forgot password?` flow can be tested without email delivery. When dev links are enabled, startup fails unless `SERVER_ADDRESS`, the reset frontend URL, and every allowed origin are loopback-only. Forwarded requests never receive the token or its expiry. Public tunnels, staging, AWS lab, and production must keep `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false`.

The same helper enables the local dev account endpoint by default with
`LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED=true`. That endpoint is disabled by default
in application configuration and should stay off for staging, production, and
public tunnel/push workflows. The dev account is not a demo account; it is a
local developer persona seeded with My Commutes routes for quick desktop/mobile UI
testing. Normal Web Push delivery remains off unless you explicitly enable the
push settings below.

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
scripts/dev-live-backend.sh
```

Password reset emails are sent as multipart HTML with a plain-text fallback and an inline LineWatchTO logo from `backend/src/main/resources/email/linewatch-logo.png`.

Do not commit SMTP usernames, passwords, API keys, or app passwords.

To send saved-commute Web Push notifications, configure VAPID keys and enable the push scheduler before starting the backend:

```bash
LINEWATCH_PUSH_ENABLED=true \
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=your-url-safe-public-key \
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=your-url-safe-private-key \
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:you@example.com \
scripts/dev-live-backend.sh
```

Push subscription endpoints are restricted to the HTTPS provider domains used by FCM, Mozilla, Apple, and Windows. Delivery uses a 3-second connect timeout and 10-second request timeout by default; each account may keep up to five enabled devices, and manual device tests have a one-minute cooldown.

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

New My Commutes routes default to weekday 6:30-9:30 AM outbound and 3:00-7:00 PM return notification windows. Existing routes keep their prior schedule during migration.

New and meaningfully changed planned closures are automatic when their stream and event-type filters allow them; there is no separate event-change master switch. One account-level follow-up policy applies to My Commutes and line subscriptions: **Smart** chooses a day-of follow-up for later closures or a within-24-hours follow-up for early-morning closures, while **Within 24 Hours**, **Day Of**, and **Announcements Only** provide explicit alternatives. Both planners emit only one applicable timing candidate per closure evaluation. My Commutes delivery also waits until the configured leg window is open.

The browser still controls permission prompts, notification ranking, and delivery. Local HTTP development works only where the browser treats the origin as trustworthy, such as `localhost`; production should use HTTPS. Notifications carry encrypted display payloads when sent, and the service worker can also fetch pending payloads from the signed-in account endpoint so stale service data is not cached into offline notifications. Saved-commute disruption notifications use stable lifecycle tags and Web Push topics. Each saved commute has its own notification rule, with independent outbound and return schedules in `America/Toronto`, quick weekday rush-hour presets, custom/overnight windows, event types, and leg toggles. Every enabled leg monitors its complete computed saved route. Window starts are inclusive, ends are exclusive, and an overnight window belongs to the day on which it starts. A current impact that starts while its rule is established but outside the configured window remains observed and can notify once when that natural window opens. Current impacts that already existed when a commute was added or its route rule was changed are recorded silently and shown in-app without a catch-up OS push. Planned-closure delivery waits until the configured leg window is open. A later clearance is only pushed for current impacts that previously produced an active saved-commute notification, and it must still pass the route's service-restored toggle, leg selection, and current leg window. Suppressed clearances are recorded as closed so they cannot leak out through a later retry. Suppressed-but-still-current saved-commute impacts remain part of lifecycle tracking so LineWatch does not send false service-restored notices merely because a route rule muted an active alert. Notification titles use the controlled format `⚠️ Line {N} {Line Name} {Event Type}`. A distinct rider-visible TTC alert update—including a delay escalating to a suspension—creates a new active delivery and re-notifies the existing active lifecycle entry; unchanged polling snapshots remain deduplicated. Line-wide Reduced Speed Zone timestamp-only refreshes are silent, and every line-wide RSZ active delivery—including a grouping, location, or direction update—must still fall inside the active-display window measured from the TTC-provided source start. Older zones refresh their observation silently instead of producing a stale start notification. Grouped multi-section RSZ bodies list the affected station sections and their directions instead of using generic corridor copy. Backend restarts, deployments, notification-copy or navigation changes, and compatible fingerprint-algorithm upgrades do not count as alert updates; existing observation rows are refreshed silently. When a current disruption clears, LineWatch sends a distinct attention-requesting `✅ Line {N} {Line Name} {Event Type} Cleared` notification with a separate browser display tag, so the active update and the clearance can both remain visible where the browser/OS allows it. Every LineWatchTO Web Push request—including active disruptions, planned alerts, diagnostic tests, cleared/service-restored updates, and payload-less fallback wake-ups—requests the Web Push protocol's highest `Urgency: high` delivery class. The service worker requests non-silent display, re-notification, and persistent presentation for active, cleared, diagnostic, and fallback notifications; browser and OS notification-channel settings retain final authority over sound, vibration, and heads-up presentation. Active deliveries accepted by the push service without a current-attempt browser report receive at most two sparse retries—after 5 minutes and then 15 minutes—within the alert's first 30 minutes. A service-worker display report stops those retries; this improves the odds during transient gaps without creating a two-minute retry storm or treating missing telemetry as proof of failure. Active push transport defaults to `LINEWATCH_PUSH_ACTIVE_DELIVERY_TTL=PT1H`, while exact active-alert display remains bounded by `LINEWATCH_PUSH_ACTIVE_DISPLAY_TTL=PT10M`; if a delayed active push arrives after that display window, the service worker shows a generic LineWatch service-update fallback instead of stale alert text. The service worker calls `showNotification()` before starting receipt telemetry, then sends its receipt and signed display acknowledgement concurrently to conserve the browser's background execution window. Active bodies include the TTC-provided start time in `America/Toronto` when available; cleared bodies include the LineWatch clearance-detection time. The clock line uses `🕗 MMM d, h:mm AM/PM` without an additional Started/Cleared label. When the app opens or receives another push event, the service worker asks the backend which notification tags should remain visible. Active impacts are removed when they are no longer dashboard-visible, while displayed service-restored notifications are retained for `LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION`, default `PT24H`, before cleanup may close them. Android and iOS may still age, rank, or remove PWA notifications according to browser and OS policy; in-app Alert History is the reliable history surface. Line-wide current alerts use a stream-observation layer: LineWatch records eligible subscribed-line events separately from delivered push events, so a clearance can be sent for an event observed while subscribed even if the active push was suppressed as catch-up or failed delivery.

Device push enablement is per browser installation. Saved-commute, line-wide, event-type, reminder, and saved-route notification-rule preferences are account-level and can be changed before a browser subscription exists. Reinstalling the PWA or switching browsers does not turn account notification preferences off, but the current installation must have browser notification permission and a valid Web Push subscription before it can receive pushes. When browser permission is already granted, LineWatchTO attempts to recreate the current installation's subscription after sign-in; when permission is not granted, the Notifications panel shows an "enable this device" state. A random installation identifier stored in browser Cache Storage lets LineWatchTO archive a prior endpoint when Chrome, Safari, or the push service rotates that installation to a new endpoint. Clearing site data or reinstalling can create a new installation identity. The More diagnostics panel labels the rotating endpoint hash separately from the more stable installation prefix, shows the installation's earliest known registration beside the current endpoint's registration time, includes a VAPID public-key fingerprint that should stay unchanged across deployments, and shows registration source, prior endpoint count, display-report evidence, accepted-without-report counts, and a manual disable action for stale endpoints.

Notification diagnostics in More are grouped by logical notification first, then by per-endpoint delivery attempts. A single LineWatch notification can produce multiple delivery rows because an account may have Android Chrome, iOS Safari, a restored PWA, or archived endpoint versions. Apple Web Push or FCM `accepted` responses mean the push service accepted LineWatchTO's delivery attempt for that endpoint; they do not guarantee that the browser or OS received or displayed the notification. A service-worker display report means `showNotification()` resolved, not that the OS surfaced it immediately or that the user saw it. HTTP 404/410 responses immediately persist the endpoint as disabled, while accepted deliveries without receipt or display evidence remain enabled because missing acknowledgement is not proof of invalidity. Diagnostics label hard-invalid deliveries as expired endpoints rather than as ordinary missing display reports, and show whether the active endpoint was user-enabled, refreshed on app open, rotated by the browser, or created as an invalid-endpoint replacement.

On Android, LineWatchTO cannot bypass Doze or Chrome's shared background scheduling policy. The More panel includes an Android-only reliability guide: when the OS offers it, set LineWatchTO's battery usage to **Unrestricted**, or set Chrome to Unrestricted if the installed PWA has no separate app entry; confirm notification permission and the notification channel's **Pop on screen** setting as well. This may use more battery and can improve delivery odds, but it does not guarantee immediate Web Push delivery. Safety-critical use cases need another channel or a native Android app designed around the platform's push APIs.

Health endpoint:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/schedule
curl http://localhost:8080/api/health/regional-ingestion
curl http://localhost:8080/api/health/regional-schedule
```

Alert ingestion is disabled by default for offline-safe local runs, CI, and demos that should not depend on the TTC public API. The `scripts/dev-live-backend.sh` command runs the backend with the `dev-live` Spring profile, which enables one scheduled poller process.

The live backend helper refuses to choose a different port silently when its configured port is occupied. This prevents a newly compiled backend from starting on 8081 while the live frontend continues calling a stale process on 8080. Stop the existing backend before restarting, or set `SERVER_PORT` for the backend and `LINEWATCH_BACKEND_URL` for the frontend to the same explicit port.

Metrolinx ingestion is independently disabled by default and requires both `LINEWATCH_INGESTION_METROLINX_ENABLED=true` and a developer key. Its poll and freshness windows default to two and ten minutes respectively. GO service alerts and UP Express GTFS-RT alerts remain required for a successful poll. GO information, marketing, GTFS-RT alerts, Train Exceptions, and GO GTFS-RT TripUpdates are supplemental: an unavailable or unauthorized supplemental collection is logged and marked unavailable without failing the poll or deactivating last-good rows from that source. Each valid rider-alert dataset is raw-staged in the alert store. Identified exception trips and TripUpdate entities are raw-staged in a separate operational store, using source-scoped upserts and full-snapshot deactivation. The ingestion health response reports all seven collections as `complete`, `unavailable`, `unknown`, `not-evaluated`, or `not-run`, with required/supplemental identity, records fetched, and each available collection's own source timestamp; the regional ingestion log displays this collection coverage plus static-schedule lookahead health. GO bus messages and amenity notices are excluded from regional service status and map impacts. Purpose-built accessibility reads retain current `Amenity` / `Elevator-Escalator Disruption` records, omit restoration notices and unmapped/bus-only facilities, and expose them only while the same ingestion run is fresh. Current dashboard normalization uses mapped GO `Service Disruption` rows and supported dedicated UP records. Fresh GO information and marketing rows are exposed only through the network-scoped notices menu; GO GTFS-RT rail-alert rows remain raw-staged. Train Exceptions and GO TripUpdates can supply structured trip changes through `GET /api/regional/trip-changes`, but only after exact active-schedule and regional-catalog matching. They still do not provide the website card's title, explanatory prose, or publication context. Because source notices can describe broad station groups, map projection is topology-based and may be approximate.

Regional realtime station arrivals and static schedule fallback are independently configurable. `LINEWATCH_REGIONAL_ARRIVALS_ENABLED=true` enables the Metrolinx-key-backed GO Next Service and UP TripUpdates reads. `LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_ENABLED=true` enables persisted public GO/UP static-GTFS reads without a developer key, while `LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_REFRESH_ENABLED=true` checks both official packages daily, skips sources whose persisted import is newer than the configured refresh interval (including after an application restart), and atomically retains the active last-good import on failure. The purpose-built `GET /api/regional/stations/{stationId}/arrivals` response uses fresh estimates where available, replaces only the matching published trip, and fills the remaining per-direction arrival slots with later published timetable rows. It deduplicates repeated source rows and looks ahead up to seven service days for infrequent Milton and Richmond Hill service. `/api/health/regional-schedule` separately reports whether both active imports cover the configured future lookahead through `requiredThrough`, preventing today's usable schedule from being mistaken for sufficient future planned-work coverage. The arrivals response distinguishes `no-service` from unavailable data and labels every row `live` or `scheduled`. Realtime estimates can change; scheduled rows are published timetable times, not live predictions or guaranteed departures.

Regional estimated train markers are also independently disabled by default. `LINEWATCH_REGIONAL_TRAIN_MARKERS_ENABLED=true` enables `GET /api/regional/trains` using the same backend-only Metrolinx key. The read combines the GO and UP Express GTFS-RT VehiclePosition full datasets, uses a 15-second backend cache, rejects source or vehicle timestamps older than two minutes, and returns explicit disabled, stale, partial-source, unavailable, and available states. UP VehiclePosition rows must match a fresh UP TripUpdates trip: the ordered stops and rider-facing destination resolve the marker direction, the matching next-stop estimate drives progress within the segment, and contradictory or unmatched records are omitted rather than rendered in the wrong direction. Only records whose route and reported next stop map cleanly to an adjacent authored regional topology link are shown. Placement remains a conservative schematic estimate; the endpoint does not expose raw payloads, geographic coordinates, exact physical locations, or movement tracks.

When alert ingestion is enabled, `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED` defaults to `true` and `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_URLS` defaults to TTC's bus and streetcar service-alert feeds. These GTFS-RT records are used only for the surface notices panel. Rapid-transit GTFS-RT records are filtered before normalization so TTC Live Alerts remains the source for subway/LRT map overlays, line status, saved-commute impacts, and push notifications.

Equivalent manual command:

```bash
SERVER_ADDRESS=127.0.0.1 LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=true mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev-live
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

These arrivals are timetable-based estimates, not live train predictions. The scheduled provider looks ahead up to seven service days so an infrequent next trip is not hidden by the normal 90-minute horizon. If no import is active, the station detail API returns a schedule-unavailable state and the frontend fallback remains demo-labeled.

For deployed environments, prefer the automatic refresh job over manual imports:

```bash
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14
```

Automatic GTFS refresh uses a two-pass streaming import that reads the 4.2M-row `stop_times.txt` without materializing it in memory. Routes, stops, services, and trips are prepared first, then stop times are streamed and inserted into PostgreSQL in bounded batches of 1,000. 

The entire replacement writes inside one atomic transaction. The old active schedule remains available and active until the candidate transaction commits successfully, ensuring a failed download or database exception does not clear or disrupt the existing schedule.

The `/api/health/schedule` endpoint reports active schedule availability, the latest refresh outcome, and station-line mapping coverage. Missing Line 6 or other route mappings are listed explicitly.

### Optional Live Arrival Provider

Set `LINEWATCH_ARRIVALS_PROVIDER=live` to enable background polling of TTC's public GTFS-RT Subway Trip Updates feed:

```bash
LINEWATCH_ARRIVALS_PROVIDER=live
LINEWATCH_ARRIVALS_LIVE_GTFS_RT_URL=https://gtfsrt.ttc.ca/trips/subway?format=text
LINEWATCH_ARRIVALS_LIVE_GTFS_RT_INITIAL_DELAY=PT10S
LINEWATCH_ARRIVALS_LIVE_GTFS_RT_FIXED_DELAY=PT1S
LINEWATCH_ARRIVALS_LIVE_SOURCE_NAME=TTC GTFS-RT subway trip updates
LINEWATCH_ARRIVALS_TRAIN_MARKER_HORIZON=PT20M
```

The live provider still depends on the active static GTFS schedule import for station/platform `stop_id` mapping. It uses fresh GTFS-RT arrival times for mapped station directions and falls back to scheduled arrivals when the feed is stale, a station/direction is absent, or a supported line has no live TripUpdate rows. Polling defaults to every 1 second and skips re-indexing when TTC returns the same feed timestamp. `LINEWATCH_ARRIVALS_TRAIN_MARKER_HORIZON` caps how far ahead `/api/trains` emits schematic map markers; it is intentionally shorter than the station-arrival horizon to keep mobile rendering usable.

> [!NOTE]
> `JAVA_TOOL_OPTIONS=-Xmx4g` is configured as production headroom, but the refresh logic is designed to complete correctness guarantees through bounded memory allocations rather than heap expansion. If an OutOfMemoryError is observed prior to running this bounded version, refresh should remain disabled until the bounded-memory release is fully deployed.

### Alert Scenario Harness

The repository includes dev/test TTC Live Alerts scenario feeds under
`backend/src/test/resources/fixtures/ttc-alert-scenarios/`. These fixtures are
TTC-shaped examples for LineWatch testing only. The `all-alert-types` scenario
uses curated synthetic-template TTC Live Alerts payloads where the repository has
useful captured examples, and modeled gap-fill records where history does not
cover a required alert shape such as directional or bidirectional station-node
impacts. Gap-fill records are modeled from the real bookmarked payloads so the
field structure stays close to TTC Live Alerts JSON.

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

When a mock scenario server starts, it rebases alert timestamps once so the
bookmarked records remain fresh and active for that server run. It then serves
the same payload on every `/live-alerts` request so polling does not create fake
routine update churn in the alert lifecycle.

Run the backend against a scenario:

```bash
scripts/dev-alert-scenario-backend.sh all-alert-types
```

The shared `all-alert-types` runner supplies both the TTC Live Alerts-shaped
catalog and the GO/UP Metrolinx-shaped catalog. Switching between TTC and GO/UP
therefore keeps both map modes deterministic and synthetic/reviewed-fixture
backed. TTC-focused scenarios such as `nonlinear-union-curve` disable regional
ingestion instead of silently showing locally configured live Metrolinx data.

If `tmp/ttc-merged-gtfs.zip` or `/tmp/ttc-merged-gtfs.zip` exists, the scenario
backend also imports scheduled rapid-transit arrivals into the `linewatch_scenario`
database. Override the zip location with `LINEWATCH_SCENARIO_GTFS_ZIP=/path/to/gtfs.zip`.

Then open the scenario frontend with `scripts/dev-alert-scenario-frontend.sh all-alert-types` and inspect
`/api/alerts`, `/api/map`, alert cards, station rings, nonlinear overlays, and
schedule-aware station arrivals. The scenario harness does not make the app an
official TTC product and does not represent a live feed.

The alert scenario backend and frontend helpers also enable the local dev
account by default, so the scenario dashboard can open saved-commute UI without
staging. Set `LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED=false` for the scenario backend
or `NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN=false` for the scenario
frontend when you need a signed-out scenario run.

Browser tab titles are intentionally distinct across common environments:
production remains `LineWatchTO`, staging builds as `LineWatchTO Staging`,
normal local dev shows `LineWatchTO Dev`, and alert scenarios show
`LineWatchTO Dev: <scenario-name>`.

### GO/UP Alert Scenario Harness

The regional companion harness exercises the real Metrolinx client envelope,
GO/UP normalizers, persistence path, regional dashboard DTOs, and interactive
map mode without requiring a developer key. Its generated fixtures live under
`backend/src/test/resources/fixtures/metrolinx-alert-scenarios/`.
`all-alert-types` combines reviewed, source-shaped samples already captured in
the repository with explicitly marked synthetic gap-fill records. It covers
all eight GO/UP corridors, GO and UP Express source formats, delay,
suspension, planned-change, route-wide, segment, station-only, overlapping
segment, elevator, escalator, and multi-corridor cases.

Regenerate the regional fixtures after editing their catalog:

```bash
node scripts/generate-regional-alert-scenarios.mjs
```

Run the backend and frontend in separate terminals:

```bash
scripts/dev-regional-alert-scenario-backend.sh all-alert-types
scripts/dev-regional-alert-scenario-frontend.sh all-alert-types
```

Other focused scenarios are `go-corridor-overlap`,
`go-station-and-accessibility`, and `up-service-alerts`. The backend uses an
isolated local Metrolinx-shaped source on port 8083, an isolated application
port (8084), database (`linewatch_regional_scenario`), and Redis database (2).
Select GO/UP in the UI, then inspect `/api/dashboard?network=regional`,
`/api/accessibility-outages?network=regional`, and
`/api/health/regional-ingestion`. Every scenario record is dev/test data; the
harness must never be described as fresh public Metrolinx service information.


Current backend scope:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend service health. |
| `GET` | `/api/health/ingestion` | Latest TTC Live Alerts poll status and record counts. |
| `GET` | `/api/health/schedule` | Active TTC GTFS schedule import, refresh, service-date, and station-line mapping coverage. |
| `GET` | `/api/health/regional-ingestion` | Metrolinx configuration, latest poll outcome, dashboard freshness, and per-collection completeness, record counts, and source timestamps. |
| `GET` | `/api/health/regional-schedule` | Active GO/UP static-GTFS imports, mapped station-corridor coverage, and configured future-lookahead coverage. |
| `GET` | `/api/regional/trip-changes` | Fresh, confidently static-schedule-matched GO cancellations and stop changes; supports `stationId`, `query`, and bounded `limit` filters. |
| `GET` | `/api/dashboard?network=ttc\|regional` | Network-scoped dashboard payload; the regional response includes fresh Metrolinx rail impacts only when ingestion is current. |
| `GET` | `/api/regional/stations/{stationId}/arrivals` | Source-labeled GO/UP live estimates, scheduled fallback, and explicit no-service/unavailable states. |
| `GET` | `/api/regional/trains` | Source-labeled, freshness-checked schematic GO/UP estimated train markers when regional vehicle-position reads are enabled. |
| `GET` | `/api/accessibility-outages?network=ttc\|regional` | Fresh network-scoped elevator and escalator notices grouped by line/corridor and mapped station; defaults to TTC. |
| `GET` | `/api/surface-notices` | Searchable detours, bypasses, service changes, and notices for surface routes (bus/streetcar). |
| `GET` | `/api/map` | Seeded station/topology data plus fresh layered segment and station-node impact metadata when ingestion is current. |
| `GET` | `/api/status` | Line status derived from fresh normalized alerts, otherwise no stale live impacts. |
| `GET` | `/api/alerts?type=live\|delay\|planned\|slowdown` | Fresh normalized suspension/active alert cards, ordinary delay cards, planned closures, and Reduced Speed Zone groups. |
| `GET` | `/api/stations?query={q}` | Seeded station summaries and search. |
| `GET` | `/api/stations/{id}` | Station detail with reviewed facilities, source-labeled arrivals (demo/unavailable/live), and fresh directly linked TTC outage/alert rows when ingestion is current. |
| `GET` | `/api/account/commutes` | Signed-in saved commutes with default route path, per-leg impact matching, standard-vs-impacted travel-time estimate ranges, and per-route notification rules. |
| `POST` | `/api/account/commutes` | Create a signed-in saved commute and optional notification rule, then return the computed route, impact summary, travel-time estimate, and rule. |
| `PATCH` | `/api/account/commutes/{id}/notification-rule` | Update one signed-in saved commute's granular notification rule for independent outbound/return day and time schedules and event types across the complete saved route. |
| `GET` | `/api/account/stations` | List the signed-in account's saved stations with freshness-gated station impact and accessibility summary fields. |
| `PUT` | `/api/account/stations/{stationId}` | Idempotently save a mapped station to the signed-in account. |
| `DELETE` | `/api/account/stations/{stationId}` | Idempotently remove a mapped station from the signed-in account. |
| `GET` | `/api/account/push/config` | Account push availability, VAPID public key, account-level notification preferences, line subscriptions, event-type filters, planned-closure follow-up policy, and enabled-device summary. |
| `PUT` | `/api/account/push/subscription` | Store or refresh the current browser Web Push subscription for the signed-in account. |
| `PUT` | `/api/account/push/preferences` | Update account-level saved-commute, line subscription, event-type, and planned-closure follow-up preferences. This does not enable or disable the current browser subscription. |
| `POST` | `/api/account/push/latest` | Let the service worker fetch and mark displayed the current batch of pending notification payloads for the current subscription. |
| `POST` | `/api/account/push/active` | Return active display tags and retained lifecycle display tags so the service worker can close stale LineWatch notifications without removing recent active/cleared lifecycle entries too early. |
| `GET` | `/api/account/push/diagnostics` | Return recent push diagnostics grouped by logical notification with nested per-device attempts and service-worker client events. |
| `GET` | `/api/account/push/devices` | Return the active VAPID-key fingerprint and active browser installations for the signed-in account with endpoint/installation prefixes, registration source, previous endpoint count, last seen, last attempt, last accepted, last display report, and stale/no-report indicators. |
| `POST` | `/api/account/push/devices/{subscriptionId}/disable` | Disable a specific account-owned push endpoint by subscription id for manual stale-device cleanup. |
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
- Grouped station, line, and current/planned rapid-transit alert search.
- My Commutes routes such as `Finch -> Union`.
- "Is my commute affected?" impact summary.
- Standard-vs-impacted saved-commute travel-time estimates with bounded extra-time ranges for delays and Reduced Speed Zones, and an unreliable timing state for suspensions and closures.
- Opt-in saved-commute Web Push alerts for dashboard-visible impacts when push is configured and the saved route's granular rule allows delivery.
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
        +--> My Commutes cards
        +--> reliability explorer
```

## Data Source Guardrails

LineWatchTO should use public and source-linked data. It should also be honest about uncertainty:

- The implemented poller reads the public TTC Live Alerts endpoint at `https://alerts.ttc.ca/api/alerts/live-alerts`.
- The visible dashboard treats successful poll results as usable only inside the configured freshness window.
- The optional regional poller uses a backend-only Metrolinx developer key and raw-stages the documented GO service, information, marketing, and GTFS-RT alert collections plus UP Express GTFS-RT alerts. Dashboard-visible supported records are freshness-gated independently from TTC data; the key and raw upstream payloads are never sent to the browser.
- Metrolinx does not document those API collections as a complete mirror of the GO/UP websites. Raw collection coverage improves auditability but must not be described as complete planned-work or website-notice coverage. GO Train Exceptions and GO GTFS-RT TripUpdates can identify structured cancellations and stop changes when matched to an active published schedule, but they do not provide the rider-facing title, prose, or publication context needed to recreate a website service-update card. Unmatched records remain internal.
- Metrolinx notices may identify a whole corridor, a set of stations, or scheduled adjustments rather than exact affected track geometry. Regional segment and station highlighting is a reviewed topology projection and may be approximate.
- Regional accessibility outages use fresh Metrolinx GO service-update records categorized as elevator/escalator amenity disruptions. Only reviewed rail station/corridor mappings are shown; restoration notices and bus-only or unmappable facilities are omitted. The feed does not provide stable facility asset IDs, complete platform-level coverage, or guaranteed outage end times.
- The optional live-arrival provider reads TTC GTFS-RT Subway Trip Updates from `https://gtfsrt.ttc.ca/trips/subway?format=text`; it infers schematic estimated train positions from predicted arrival times and falls back to scheduled service when fresh mapped live rows are unavailable.
- Estimated train markers are schematic placements inferred from arrival predictions. They should not be treated as exact train locations or live train movement.
- TTC alerts can be vague.
- GTFS-RT service alerts can be less structured than TTC Live Alerts and may lack usable subway/LRT affected-segment detail. LineWatchTO uses only the bus and streetcar GTFS-RT service-alert feeds for surface notices by default.
- Alert history is based on LineWatch snapshots and is richer after the alert-history release; older rows may lack full line, cause, direction, or location context.
- Some alerts name broad corridors rather than exact station-to-station segments.
- Planned closure pages or feeds may change format.
- Segment inference may be imperfect.
- Overnight closed-mode uses general TTC subway operating hours; exact first and last trains vary by station, holidays, and service changes.
- Saved commute route matching uses scheduled adjacent-station weights from the active TTC GTFS import when available, then seeded per-segment fallback travel times, with deterministic topology fallback weights only as a last resort. Return trips are computed as a separate monitored leg when enabled, and directional service impacts only count when they match the commute leg direction or are bidirectional. Extra-time estimates are bounded heuristics over the matched dashboard-visible impacts: delays and Reduced Speed Zones can produce a range, while suspensions and closures are marked unreliable instead of inventing a detour duration. This is useful for in-app route awareness, but it is not a full TTC trip planner and does not reflect live train travel times.
- Saved-commute push notifications are derived from the same network-scoped dashboard-visible impact matching and each saved route's notification rule. Regional delivery additionally requires fresh successful Metrolinx ingestion. They should not be described as comprehensive TTC or Metrolinx alerts, all-map alerts, email alerts, alternate-route recommendations, or guaranteed delivery.
- Accessibility outages use fresh TTC Live Alerts rows in TTC mode and fresh mapped Metrolinx amenity records in GO/UP mode. Surface notices use fresh TTC Live Alerts rows plus filtered TTC GTFS-RT bus/streetcar service-alert records, and disappear when ingestion is stale. They are source-labeled, but do not affect segment highlights, current line status, saved-commute impacts, reliability ratings, or push notifications.
- This app is unofficial, is not affiliated with TTC or Metrolinx, and should not be treated as the sole source of truth for transit service.

## Verification Baseline

Before claiming a frontend change is complete, run:

```bash
node scripts/tests/performance-measurements.test.mjs
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

## Repeatable Performance Measurements

The dependency-free portfolio measurement runner records the source revision,
dirty-worktree state, host/runtime metadata, exact workload, failures, and
timing summaries in both JSON and Markdown. Reports default to the ignored
`artifacts/performance/` directory so machine-specific results are not presented
as universal production numbers.

With a local backend already running against PostgreSQL/PostGIS and Redis,
measure the primary read-only API boundaries:

```bash
node scripts/measure-portfolio-performance.mjs api \
  --base-url http://localhost:8080 \
  --warmup 5 \
  --requests 50 \
  --label local-seeded
```

This sends sequential requests from one client, consumes each response body,
excludes warm-up requests, and reports success counts, response sizes, and min,
median, p95, p99, max, and mean latency. It is a latency comparison harness, not
a concurrent load or capacity test. Failed attempt duration is retained
separately and does not distort the successful-response latency summary. Run
production measurements from a separate machine and describe whether Cloudflare
or Caddy caching is in the request path.

Measure build and test wall-clock time against the current dependency and build
caches:

```bash
node scripts/measure-portfolio-performance.mjs commands \
  --runs 3 \
  --label dev-server-warm-cache
```

The command catalog includes backend tests, frontend fixture tests, typecheck,
lint, production build, and the complete Playwright smoke suite. Use repeated
`--command <id>` options to select a smaller comparison set; run `--help` for
the catalog. The report is still written and the process exits nonzero if any
request or command fails.

Compare reports only when the host, power profile, revision, cache state,
backend profile, database snapshot, and workload match. See
[`docs/superpowers/specs/2026-07-29-portfolio-performance-measurements-design.md`](docs/superpowers/specs/2026-07-29-portfolio-performance-measurements-design.md)
for the methodology and interpretation guardrails.

## Portfolio Story

LineWatchTO is intended to demonstrate:

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

> Engineered LineWatchTO, an unofficial TTC reliability dashboard using Java 21, Spring Boot, PostgreSQL/PostGIS, Redis, Next.js, and TypeScript to visualize live subway/LRT disruptions, planned closures, and My Commutes impacts across Toronto.

## Roadmap

Repeatable API, build, and test performance measurement tooling is implemented.
Further product expansion—such as user-composed multi-network commutes or optional email
notifications—should start only with a concrete rider or portfolio need. A future combined
commute would require riders to choose and order each TTC or GO/UP rail leg explicitly; it
would not infer an optimal transfer, include buses or walking, or present an end-to-end time
without transfer and waiting data.

## License and Disclaimer

This is an unofficial commuter tool and portfolio project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission.
