# Contributing to LineWatchTO

This guide explains how to set up your local development environment, run test tiers proportionally, work safely with fixtures, and manage generated assets. Project code and original documentation use the [MIT license](LICENSE); third-party data and assets retain their separate terms.

---

## 1. Principles & Domain Invariants

LineWatchTO is an unofficial transit reliability dashboard for Toronto's TTC subway/LRT and GO/UP rail networks.

- **Work proportionally**: For local color, spacing, copy, or layout tweaks, locate the owning file, edit it, inspect the affected view, and report briefly. Skip heavy application test suites for cosmetic changes. For behavior changes, write targeted regression coverage and run that layer's checks.
- **Honest data labeling**: Label fixture/demo, scheduled, live, stale, and offline data honestly. Live claims require active enabled ingestion and fresh source data. Estimated train markers are schematic placements, not physical GPS tracks.
- **Server-side credential isolation**: Never commit third-party API keys (e.g. Metrolinx developer key) or raw provider payloads to Git. Keep upstream credentials and payloads server-side.
- **Domain rules**: Review [docs/domain-invariants.md](docs/domain-invariants.md) before modifying alert normalization, arrival estimation, or commute disruption matching.
- **Source launch gates**: Review [docs/source-licensing-launch-gates.md](docs/source-licensing-launch-gates.md) before changing public data boundaries or ingestion claims.

---

## 2. Environment & Prerequisites

- **Node.js**: 24 LTS with npm (matches the frontend container)
- **Java**: 21 LTS
- **Build tool**: Apache Maven 3.9+
- **Database & Cache**: Docker and Docker Compose (PostgreSQL 16/17 with PostGIS, Redis 7)

---

## 3. Local Setup

### Instant Frontend (Fixture Mode)

The frontend runs independently out of the box with zero database or backend configuration by falling back to typed local fixtures:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dark, map-first dashboard with realistic fixture data.

### Full-Stack Local Development

To run with the Spring Boot backend, PostgreSQL/PostGIS, and Redis:

```bash
# 1. Prepare environment variables
cp .env.example .env

# 2. Start PostgreSQL/PostGIS and Redis in the background
docker compose up -d postgres redis

# 3. Start the Spring Boot backend
mvn -f backend/pom.xml spring-boot:run

# 4. In a separate terminal, start the frontend
npm --prefix frontend run dev
```

### Live Alert Polling Profile

TTC Live Alerts polling is disabled by default for offline-safe local runs. To enable background polling:

```bash
scripts/dev-live-backend.sh
```

---

## 4. Safe Fixture Use & Alert Scenarios

Do **not** commit live captured payloads or production raw data to the repository. LineWatchTO provides a deterministic alert scenario harness for local testing:

- **Catalogs**: Scenario definitions live in `scripts/alert-scenario-catalog.mjs` (TTC) and `scripts/regional-alert-scenario-catalog.mjs` (GO/UP).
- **Regenerate Fixtures**:
  ```bash
  node scripts/generate-alert-scenarios.mjs
  node scripts/generate-regional-alert-scenarios.mjs
  ```
- **Run Scenario**:
  ```bash
  # Start scenario backend and mock server
  scripts/dev-alert-scenario-backend.sh all-alert-types

  # Start scenario frontend
  scripts/dev-alert-scenario-frontend.sh all-alert-types
  ```

---

## 5. Test Tiers & Verification

Run tests proportionally based on the scope of changes. For full details, see [docs/testing.md](docs/testing.md).

| Tier | Command | Purpose |
| --- | --- | --- |
| **Frontend Fast** | `npm --prefix frontend run test:fast` | Unit and contract tests using Node's native runner (~1.7s) |
| **Typecheck** | `npm --prefix frontend run typecheck` | Next.js route type generation and TypeScript compile check |
| **Lint** | `npm --prefix frontend run lint` | ESLint rules across frontend code |
| **Script Tests** | `npm --prefix frontend run test:scripts` | CLI, asset-normalizer, and tool tests (~150ms) |
| **Production Build** | `npm --prefix frontend run build` | Next.js static page and bundle generation |
| **Backend Unit/Int** | `mvn -f backend/pom.xml test` | Full backend test suite (~15s) |
| **Smoke Suite** | `npm --prefix frontend run test:smoke` | Lean Playwright Chromium release smoke gate |
| **Offline Gate** | `npm --prefix frontend run test:offline` | PWA service worker and offline snapshot hydration |
| **E2E Regression** | `npm --prefix frontend run test:e2e` | Comprehensive desktop and mobile interaction regression |

---

## 6. Generated Assets & Reproducibility

LineWatchTO maintains pre-generated assets in Git so normal builds and checkouts do not depend on external authoring tools:

1. **Map Raster Planes**:
   Pre-generated PNG planes optimize desktop panning performance for complex SVG maps. If you modify SVG map geometry, regenerate rasters using:
   ```bash
   npm --prefix frontend run generate:map-rasters
   ```
   Requires Inkscape 1.4+. See [docs/map-asset-preparation.md](docs/map-asset-preparation.md).

2. **OpenGraph Social Images**:
   Authored via the consolidated CLI in `frontend/scripts/generate-og-image.mjs`:
   ```bash
   npm --prefix frontend run generate:og-image
   ```
   See [docs/script-inventory.md](docs/script-inventory.md).

3. **Onboarding Screenshots**:
   Captures for the first-visit slideshow:
   ```bash
   npm --prefix frontend run screenshots:onboarding
   npm --prefix frontend run screenshots:onboarding:check
   ```

4. **README presentation**:
   Keep the README's behavior, boundaries, setup commands, and diagrams accurate when changing the product. Dependency manifests own exact versions; avoid undated test counts, benchmark claims, or adoption numbers. Capture README screenshots from public application views with fresh relevant source data, preserve source labels and dated captions, and review images for account details or operational identifiers. Onboarding and test captures keep their synthetic data and demo labels. See [README image provenance](docs/assets/README.md).

---

## 7. Guidelines for AI & Agent Work

- Read the root [AGENTS.md](AGENTS.md) and scoped guides ([frontend/AGENTS.md](frontend/AGENTS.md), [backend/AGENTS.md](backend/AGENTS.md), [mobile/AGENTS.md](mobile/AGENTS.md)) before making edits.
- Keep agent guides lean (under 100 lines for root, under 80 for scoped guides).
- Do not recreate retired `GEMINI.md` inventories or write sprawling plan transcripts into active guides.
- Run the layer's focused checks once when stable; do not run end-to-end suites after cosmetic edits.
