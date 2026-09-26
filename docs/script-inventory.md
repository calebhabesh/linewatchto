# LineWatchTO Script Inventory and Tooling Catalog

This catalog documents all runnable scripts and developer tools across LineWatchTO. For each entry point, it identifies the owner, purpose, required inputs, generated outputs, verifying tests, and source availability invariants.

---

## 1. Local Development & Scenario Tooling

These scripts coordinate local developer environments, synthetic alert scenarios, mock providers, and isolated dev configurations.

| Entry point | Owner | Purpose & Lifecycle | Required inputs | Outputs / Ports | Verifying test | Notes / Alias status |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/dev-backend-live.sh` | Backend / Dev | Starts Spring Boot with dev account enabled and local live profiles | PostgreSQL (`5434`), Redis (`6380`), optional `SERVER_PORT` (default `8080`) | Backend process on port `8080` (or configured port) | `frontend/tests/scenario-scripts.test.mjs` | Primary local backend launcher |
| `scripts/dev-live-backend.sh` | Backend / Dev | Compatibility alias forwarding to `dev-backend-live.sh` | Same as `dev-backend-live.sh` | Same as `dev-backend-live.sh` | `frontend/tests/scenario-scripts.test.mjs` | Retained compatibility alias for existing docs/workflows |
| `scripts/dev-live-frontend.sh` | Frontend / Dev | Starts Next.js dev server with dev account auto-login | Running backend on port `8080` | Next.js dev server on port `3000` | `frontend/tests/scenario-scripts.test.mjs` | Sets `NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN=true` |
| `scripts/dev-alert-scenario.sh` | Alerts / Dev | Launches isolated TTC alert scenario backend alongside mock server | Scenario name (`$1` or `LINEWATCH_ALERT_SCENARIO`, default `all-alert-types`) | Mock server (`8081`), scenario backend (`8082`, DB `linewatch_scenario`) | `frontend/tests/scenario-scripts.test.mjs` | Primary scenario orchestrator |
| `scripts/dev-alert-scenario-backend.sh` | Alerts / Dev | Compatibility alias forwarding to `dev-alert-scenario.sh` | Scenario name (`$1`) | Same as `dev-alert-scenario.sh` | `frontend/tests/scenario-scripts.test.mjs` | Retained compatibility alias |
| `scripts/dev-frontend-scenario.sh` | Frontend / Dev | Starts Next.js dev server connected to scenario backend | Scenario name (`$1`), scenario backend running on `8082` | Next.js dev server on port `3000` with scenario tab title | `frontend/tests/scenario-scripts.test.mjs` | Sets `LINEWATCH_BACKEND_URL=http://localhost:8082` |
| `scripts/dev-alert-scenario-frontend.sh` | Frontend / Dev | Compatibility alias forwarding to `dev-frontend-scenario.sh` | Scenario name (`$1`) | Same as `dev-frontend-scenario.sh` | `frontend/tests/scenario-scripts.test.mjs` | Retained compatibility alias |
| `scripts/mock-alerts-server.mjs` | Alerts / Dev | HTTP server returning TTC Live Alerts JSON for selected scenario | Scenario name (`$1` or `LINEWATCH_ALERT_SCENARIO`), port (`LINEWATCH_ALERT_SCENARIO_PORT`, default `8081`) | HTTP endpoints: `/__scenarios`, `/api/alerts/live-alerts`, Metrolinx endpoints | `frontend/tests/scenario-scripts.test.mjs` | Pure ESM mock server; serves synthetic scenario feeds |
| `scripts/mock-alerts-server.js` | Alerts / Dev | CommonJS forwarding wrapper for `mock-alerts-server.mjs` | Same as `mock-alerts-server.mjs` | Same as `mock-alerts-server.mjs` | `scripts/mock-alerts-server.js` runner check | Retained CommonJS wrapper for environments without root ESM package |
| `scripts/dev-regional-alert-scenario-backend.sh` | Regional / Dev | Launches isolated GO/UP scenario backend against Metrolinx mock server | Scenario name (`$1`), PostgreSQL (`5434`), Redis (`6380`) | Regional mock server (`8083`), backend (`8082`, DB `linewatch_regional_scenario`, Redis DB 2) | `frontend/tests/scenario-scripts.test.mjs` | Enforces Metrolinx ingestion enabled, TTC alerts disabled |
| `scripts/dev-regional-alert-scenario-frontend.sh` | Regional / Dev | Launches frontend connected to regional scenario backend | Scenario name (`$1`) | Next.js dev server on port `3000` with regional scenario label | `frontend/tests/scenario-scripts.test.mjs` | Configures regional scenario environment labels |
| `scripts/mock-regional-alerts-server.mjs` | Regional / Dev | HTTP mock server for Metrolinx Open Data API endpoints | Scenario name (`$1`), port (`8083`) | HTTP endpoints on port `8083` for GO Service Alerts and UP GTFS-RT alerts | `frontend/tests/scenario-scripts.test.mjs` | Pure ESM regional mock server |
| `scripts/dev-backend-live-push.sh` | Push / Dev | Launches backend with local Web Push enabled using ephemeral VAPID keys | PostgreSQL, Redis; writes keys to `/tmp/linewatch-vapid.env` | Spring Boot backend with `LINEWATCH_PUSH_ENABLED=true` | `frontend/tests/scenario-scripts.test.mjs` | Generates P-256 prime256v1 ECDH keys for local testing |
| `scripts/dev-cloudflare-push.sh` | Push / Ops | Launches end-to-end Cloudflare tunnel dev environment for push testing | Cloudflare tunnel configuration in `~/.cloudflared/config.yml` | Publicly accessible HTTPS tunnel pointing to local Next dev and backend | `frontend/tests/scenario-scripts.test.mjs` | Configures `LINEWATCH_DEV_ALLOWED_ORIGIN` dynamically |

---

## 2. Asset Authoring & Normalization Tooling

These tools generate, normalize, and export static assets (SVG maps, raster planes, social preview images).

> [!NOTE]
> **Source Availability Policy**:
> Raw authoring design files (e.g. CorelDRAW/Inkscape vector sources or raw desktop screenshots) are optional authoring inputs.
> **All production assets and raster planes are checked into git under `frontend/public/assets/linewatch/`**.
> Standard builds (`npm run build`), unit test suites, and Docker containers do not require external authoring inputs or running these tools.

| Entry point | Owner | Purpose & Lifecycle | Required inputs | Outputs / Ports | Verifying test | Notes / Alias status |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/prepare-ttc-map-asset.mjs` | Map Assets | Normalizes authored TTC subway map SVG into runtime SVG | Source SVG (`$1`), output SVG (`$2`) | Validated SVG with 109 station labels, 110 anchors, contract layers | `frontend/tests/map-layering.test.mjs` | CLI validates viewBox, layers, unique IDs, and anchor integrity |
| `scripts/prepare-regional-map.mjs` | Map Assets | Normalizes authored Metrolinx regional rail map SVG | Source SVG (`$1` or `LINEWATCH_REGIONAL_MAP_SOURCE`), output SVG (`$2`) | Validated SVG with padded viewBox, 78 station anchors, contract layers | `scripts/tests/regional-map-normalizer-cli.test.mjs` | Uses `scripts/lib/regional-map-normalizer.mjs` |
| `scripts/import-linewatch-map-assets.mjs` | Map Assets | Bulk normalizes TTC and Regional SVGs and connection logos | Source directory (`$1` or `LINEWATCH_MAP_SOURCE_DIR`), optional airport source (`$2`) | Writes checked-in SVGs to `frontend/public/assets/linewatch/` | `frontend/tests/regional-map-normalizer.test.mjs` | Batch automation for map source updates |
| `frontend/scripts/generate-map-rasters.mjs` | Raster Assets | Generates high-DPI multi-plane PNG tiles from checked-in SVGs | Inkscape 1.4+ on PATH, TeX Gyre Heros font, optional `--density=<mobile\|balanced\|desktop>` | 63 PNG rasters in `frontend/public/assets/linewatch/raster-maps/` | `frontend/tests/map-raster-renderer.test.mjs` | Driven by manifest `frontend/src/app/map-raster-manifest.ts` |
| `frontend/scripts/generate-og-image.mjs` | SEO Assets | Generates branded social preview OpenGraph image from screenshot | Playwright Chromium, `--input` / `LINEWATCH_OG_SOURCE_IMAGE`, optional `--output`, `--style <glass\|blur>` | Social preview PNG (default `frontend/public/assets/linewatch/og-image.png`) | `scripts/tests/generate-og-image.test.mjs` | Unified portable CLI with `--help` and input validation |
| `frontend/generate_og_glass.js` | SEO Assets | Compatibility wrapper for `generate-og-image.mjs` using glassmorphic style | Same as `generate-og-image.mjs` | Same as `generate-og-image.mjs` (default style: `glass`) | `scripts/tests/generate-og-image.test.mjs` | Retained compatibility wrapper; zero hardcoded paths |
| `frontend/generate_og_blur.js` | SEO Assets | Compatibility wrapper for `generate-og-image.mjs` using blur/haze style | Same as `generate-og-image.mjs` | Same as `generate-og-image.mjs` (default style: `blur`) | `scripts/tests/generate-og-image.test.mjs` | Retained compatibility wrapper; zero hardcoded paths |
| `frontend/scripts/generate-onboarding-screenshots.mjs` | Docs Assets | Refreshes onboarding slideshow screenshots with synthetic demo data | Playwright Chromium, optional `--project`, `--grep` | PNGs in `frontend/public/assets/linewatch/onboarding/` and HTML report | `npm run screenshots:onboarding:check` | Uses isolated test ports 4193/4194; no credentials required |

---

## 3. Data Pipelines & Schedule Ingestion

These scripts fetch public transit GTFS archives, generate scenario fixtures, and ingest schedule data.

| Entry point | Owner | Purpose & Lifecycle | Required inputs | Outputs / Ports | Verifying test | Notes / Alias status |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/download-ttc-gtfs.mjs` | GTFS Ingestion | Fetches current TTC merged GTFS zip from City of Toronto Open Data CKAN | Output zip path (`$1`, default `/tmp/ttc-merged-gtfs.zip`) | Downloaded GTFS zip | Direct execution | Public open data API; no API key required |
| `scripts/download-geographic-gtfs.mjs` | Geographic Map | Downloads TTC, GO, and UP GTFS archives with SHA-256 integrity verification | Destination directory (`$1`, default `/tmp/linewatch-gtfs`) | `completegtfs.zip`, `GO-GTFS.zip`, `UP-GTFS.zip` | Direct execution / verified SHA-256 | Source-linked public Metrolinx & Toronto feeds |
| `scripts/generate-geographic-catalog.mjs` | Geographic Map | Builds runtime GeoJSON catalog from authoritative GTFS stop coordinates | Downloaded GTFS in `/tmp/linewatch-gtfs` | `frontend/public/assets/linewatch/geographic-network-catalog.json` | `frontend/tests/geographic-catalog.test.mjs` | Generates station anchors and route links |
| `scripts/import-ttc-gtfs-schedule.sh` | GTFS Ingestion | Ingests TTC schedule trips and stop times into PostgreSQL | Path to GTFS zip (`$1`), PostgreSQL (`5434`) | Ingested schedule departures in database | `RegionalGtfsScheduleImportIntegrationTest` | Enforces 1 GB heap streaming budget |
| `scripts/generate-alert-scenarios.mjs` | Alerts / Fixtures | Regenerates checked-in TTC alert scenario fixture files | `scripts/alert-scenario-catalog.mjs` | JSON files in `backend/src/test/resources/fixtures/ttc-alert-scenarios/` | `performance-measurements.test.mjs` | Regenerates committed synthetic fixtures |
| `scripts/generate-regional-alert-scenarios.mjs` | Regional / Fixtures | Regenerates checked-in Metrolinx alert scenario fixture files | `scripts/regional-alert-scenario-catalog.mjs` | JSON files in `backend/src/test/resources/fixtures/metrolinx-alert-scenarios/` | `frontend/tests/scenario-scripts.test.mjs` | Regenerates committed regional fixtures |
| `scripts/alert-scenario-templates.mjs` | Alerts / History | Evaluates alert history timestamps and generates navigation bookmarks | Optional `--since`, `--until`, `--network` | JSON bookmarks | `frontend/tests/scenario-scripts.test.mjs` | Analyzes historical disruption clusters |

---

## 4. Architecture, Measurement & Test Harness Tooling

These tools support automated verification, CSS metrics enforcement, and benchmark measurement.

| Entry point | Owner | Purpose & Lifecycle | Required inputs | Outputs / Ports | Verifying test | Notes / Alias status |
| --- | --- | --- | --- | --- | --- | --- |
| `frontend/scripts/start-playwright-app.mjs` | Test Harness | Serves Next.js app on isolated test port with build freshness caching | Target test port (`LINEWATCH_APP_PORT`, default `4175`), backend URL | Running Next.js server on test port; checks build stamp | All Playwright suites (`test:smoke`, `test:shell`, etc.) | Skips Next.js rebuild when sources match `.next/.linewatch-playwright-build-stamp` |
| `frontend/scripts/measure-css.mjs` | CSS Architecture | Parses CSS stylesheet graph, counts rules/selectors, ratchets `!important` | Stylesheets in `frontend/src/styles/`, optional `--record-build` | Terminal report, updates `docs/globals-css-refactor-progress.md` on build | `frontend/tests/measure-css.test.mjs` | Enforces CSS architecture budgets |
| `frontend/scripts/stylesheet-graph.mjs` | CSS Architecture | Computes CSS `@import` graph and cycle detection | Stylesheet directory | Directed import graph | `frontend/tests/stylesheet-graph.test.mjs` | Module used by CSS guardrails |
| `frontend/scripts/preview-closing-soon.mjs` | Frontend / Dev | Simulates subway closing-soon and closed states at target clock times | Time string (`$1`, e.g. `01:45`) | Browser preview of closing banner / peek chips | `frontend/tests/subway-closing-soon.test.mjs` | Rapid visual simulation tool |
| `scripts/measure-portfolio-performance.mjs` | Benchmarking | Measures suite execution times and HTTP API latency against baselines | Optional `--tier=<name>`, `--runs=<count>`, `--output=<path>`, `--baseline=<path>` | Benchmark markdown report in `artifacts/performance/` and console summary | `scripts/tests/performance-measurements.test.mjs` | Covers all test tiers and production API endpoints |
| `scripts/summarize-chrome-trace.py` | Performance | Analyzes Chrome DevTools CPU/rendering trace JSON files | Trace JSON path (`$1`) | Summary of scripting, rendering, layout, and idle times | Python CLI execution | Inspects frame drops and gesture bottlenecks |

---

## 5. Operations, Staging & Production Deployment

These scripts automate container builds, volume initialization, database migrations, backups, and health verification for VPS deployment.

| Entry point | Owner | Purpose & Lifecycle | Required inputs | Outputs / Ports | Verifying test | Notes / Alias status |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/smoke-deploy.mjs` | Deployment / Ops | Validates live deployment health, schedules, static pages, and reliability APIs | Deployment URL (`$1` or `LINEWATCH_DEPLOY_URL`) | HTTP assertions against health, schedules, reliability | `frontend/tests/scenario-scripts.test.mjs` | Validates releases post-deployment |
| `scripts/prod-compose.sh` | Production / Ops | Wrapper for production Docker Compose commands | `.env.production`, `.env.release` | Executes Docker Compose for production stack | `scripts/tests/prod-release-tools.test.sh` | Protects production environment boundaries |
| `scripts/prod-build-push.sh` | Release / Ops | Builds multi-architecture container images and pushes to GHCR | Git commit SHA, GHCR credentials | Published images on `ghcr.io` | `scripts/tests/prod-release-tools.test.sh` | Builds ARM64/AMD64 images |
| `scripts/prod-deploy.sh` | Release / Ops | Deploys release to production VPS via SSH | `.env.release`, SSH host access | VPS image pull, Flyway migration, zero-downtime restart, smoke check | `scripts/tests/prod-release-tools.test.sh` | Authoritative deployment workflow |
| `scripts/prod-backup-postgres.sh` | Maintenance / Ops | Takes compressed SQL dump of production PostgreSQL | Running production Postgres container | Timestamped `.sql.gz` dump file | `scripts/tests/prod-release-tools.test.sh` | Database backup automation |
| `scripts/prod-init-volumes.sh` | Setup / Ops | Prepares file permissions for production Docker named volumes | Root/sudo on host | Initialized volume directories | `scripts/tests/prod-release-tools.test.sh` | Pre-deploy host setup |
| `scripts/prod-observability-up.sh` | Observability / Ops | Launches Prometheus and Grafana on private internal port 9090 | Prometheus configuration | Observability stack running on private port | `scripts/tests/prod-release-tools.test.sh` | Blocked at Caddy; private metrics only |
| `scripts/check-env-functional-parity.sh` | Config / Ops | Asserts variable parity across `.env.example`, `.env.staging`, `.env.production` | Environment files | stdout comparison; exits non-zero on missing keys | `scripts/tests/prod-release-tools.test.sh` | Prevents configuration drift |
| `scripts/observability-check-env.sh` | Observability / Ops | Verifies Prometheus and Grafana tokens and endpoints | Environment variables | stdout validation report | `scripts/tests/prod-release-tools.test.sh` | Pre-flight check for observability |
| `scripts/staging-compose.sh` | Staging / Ops | Wrapper for staging Docker Compose commands | `.env.staging` | Docker Compose commands for staging | `scripts/tests/staging-tools.test.sh` | Isolated from production volumes and tags |
| `scripts/staging-up.sh` | Staging / Ops | Starts staging container stack | `.env.staging` | Staging containers running | `scripts/tests/staging-tools.test.sh` | Staging lifecycle management |
| `scripts/staging-down.sh` | Staging / Ops | Stops staging container stack | `.env.staging` | Staging containers stopped | `scripts/tests/staging-tools.test.sh` | Staging lifecycle management |
| `scripts/staging-reset.sh` | Staging / Ops | Clears and resets staging database and redis data | `.env.staging` | Fresh staging volumes | `scripts/tests/staging-tools.test.sh` | Clean-slate staging testing |
| `scripts/staging-smoke.sh` | Staging / Ops | Runs `smoke-deploy.mjs` against staging endpoints | Staging URL | Smoke test report | `scripts/tests/staging-tools.test.sh` | Pre-release qualification gate |
| `scripts/staging-observability-up.sh` | Observability / Staging | Launches staging metrics stack | Staging Prometheus config | Staging metrics services | `scripts/tests/staging-tools.test.sh` | Isolated staging metrics |
| `scripts/aws-lab-smoke.sh` | Lab / Ops | Runs health checks against AWS lab environment | Lab configuration | Smoke report | `scripts/tests/aws-lab-tools.test.sh` | Lab test verification |
