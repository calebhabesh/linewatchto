# LineWatchTO

LineWatchTO is an unofficial transit reliability dashboard for Toronto's TTC subway/LRT and GO/UP rail networks. Designed as a dark, high-density, map-first web application, it combines source-linked service alerts, planned advisories, GTFS route data, My Commutes impact checks, and historical alert snapshots to quickly answer:

> **Is my route affected now, later today, or this weekend?**

The project is built as a production-grade full-stack application featuring graceful local-fixture fallback, resilient offline PWA snapshot hydration, streaming GTFS schedule ingestion, and server-side provider isolation.

---

## Current Capabilities & Boundaries

### Core Capabilities

- **Interactive Transit Maps**:
  - Semantic SVG-backed schematic maps for the TTC subway/LRT network (Lines 1, 2, 4, 5, 6) and GO/UP regional network (all 8 rail corridors), independently authored in Inkscape.
  - Optional Geographic Map view with a compact **Diagram / Map** toggle, powered by MapLibre GL JS and OpenFreeMap vector basemaps with automatic light/dark mode adaptation.
  - Multi-plane raster rendering: pre-rendered static raster planes ensure 60 FPS panning and zooming on desktop without re-rasterizing large SVG text trees.
  - Dynamic overlay system: active suspensions (red), ordinary delays with static effect (orange), Reduced Speed Zones with directional chevrons, and upcoming planned advisories (blue preview).
  - Schematic estimated train markers inferred from GTFS-RT subway and regional vehicle positions.

- **Service Alerts & Current Status**:
  - Compact Current Service readout grouping suspensions and delays by rail line alongside a dedicated surface/service notice column.
  - Network-scoped service notices: TTC bus and streetcar service changes; GO/UP Metrolinx Information, Marketing, and rail timetable announcements.
  - Searchable accessibility outages panel tracking elevator and escalator disruptions across both networks.
  - 30-day disruption analytics and alert lifecycle history derived from durable snapshot records.

- **My Commutes & Account Features**:
  - Account-backed monitored routes (e.g. `Finch -> Union`) with weighted rapid-transit path calculation.
  - Direction-aware disruption matching with standard-vs-impacted travel time estimates.
  - Granular Web Push notifications: independent outbound and return schedules in `America/Toronto`, event-type filters (suspensions, delays, Reduced Speed Zones, cancellations), and planned advisory follow-up policies.
  - Account-backed My Stations watchlist for quick station access and compact arrival previews.
  - Optional Google sign-in and email/password authentication with secure session cookies.

- **Station Arrivals & Surface Connections**:
  - Rapid-transit arrivals: live predictions from TTC GTFS-RT Subway Trip Updates and Metrolinx Next Service, falling back seamlessly to static GTFS scheduled service.
  - Mapped station details: station-line tags, reviewed line-specific wheelchair and elevator accessibility, and reviewed station notices.
  - Station surface connections: live/scheduled bus and streetcar connections indexed via static-GTFS parent-station relationships.

- **Resilient Offline Architecture**:
  - Graceful fixture fallback: if the backend is offline or unreachable, the frontend falls back seamlessly to typed local fixtures (`frontend/src/app/linewatch-data.ts`).
  - Installable PWA: service worker caches the application shell and retains 7-day last-successful public dashboard snapshots for offline viewing with honest freshness labeling.

### Invariants & Boundaries

- **Unofficial Status**: LineWatchTO is an independent, unofficial project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission (TTC) or Metrolinx.
- **Data Freshness Invariant**: Live service claims require active, enabled ingestion and fresh source data. If an ingestion window expires, live impacts are suppressed rather than presented as stale current data.
- **Schematic Placements**: On-map estimated train markers are schematic topological projections derived from GTFS-RT predictions, not physical GPS tracking.
- **Server-Side Isolation**: Third-party API credentials (such as the Metrolinx developer key) and raw upstream payloads remain strictly server-side and are never exposed to the client or checked into Git.
- **Surface Transit Scope**: Buses and streetcars appear in searchable service notices and station surface connections; they do not generate map overlays, line status, or commute disruption routes.

---

## Repository Layout

```text
backend/   Spring Boot API, ingestion poller, spatial models, and backend tests
frontend/  Next.js dashboard, typed fixtures, UI components, styles, and web tests
mobile/    Native workspace for future platform projects (see mobile/AGENTS.md)
docs/      Domain invariants, operations runbooks, test guides, and architecture references
scripts/   Operational, scenario, and asset-generation CLI tools (see docs/script-inventory.md)
```

Key guidance files:
- [AGENTS.md](AGENTS.md) — Unified agent guide and task routing.
- [frontend/AGENTS.md](frontend/AGENTS.md) — Web UI conventions, CSS ownership, and frontend checks.
- [backend/AGENTS.md](backend/AGENTS.md) — API contracts, persistence constraints, and backend checks.
- [mobile/AGENTS.md](mobile/AGENTS.md) — Native mobile workspace guidance.

---

## Quickstart & Local Setup

### Prerequisites

- **Node.js**: 20+ with npm
- **Java**: 21 LTS
- **Build Tool**: Apache Maven 3.9+
- **Container Engine**: Docker and Docker Compose

### 1. Instant Frontend (Fixture Mode)

Run the dashboard immediately with zero database or backend configuration. The application detects the missing backend and serves typed, realistic local fixtures:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the full interactive dashboard.

### 2. Full-Stack Local Development

To run with the complete Spring Boot backend, PostgreSQL/PostGIS, and Redis:

```bash
# Prepare environment configuration
cp .env.example .env

# Start PostgreSQL/PostGIS and Redis
docker compose up -d postgres redis

# Run Spring Boot backend (port 8080)
mvn -f backend/pom.xml spring-boot:run

# In another terminal, start the Next.js frontend (port 3000)
npm --prefix frontend run dev
```

### 3. Live Alert Ingestion Profile

Alert polling is disabled by default for offline-safe local development. To start the backend with opt-in live polling for TTC Live Alerts:

```bash
scripts/dev-live-backend.sh
```

Optional Metrolinx GO/UP polling can be enabled by adding your developer key to `.env.local`:
```bash
LINEWATCH_INGESTION_METROLINX_ENABLED=true
LINEWATCH_INGESTION_METROLINX_API_KEY=your_key_here
```

### 4. Alert Scenario Test Harness

LineWatchTO includes an isolated scenario harness to test the dashboard against deterministic, synthetic, and curated alert datasets without live external network calls:

```bash
# Start backend against curated scenarios (e.g. all-alert-types, line-5-suspension)
scripts/dev-alert-scenario-backend.sh all-alert-types

# Start frontend in another terminal
scripts/dev-alert-scenario-frontend.sh all-alert-types
```

For GO/UP regional alert scenarios, use `dev-regional-alert-scenario-backend.sh` and `dev-regional-alert-scenario-frontend.sh`. See [docs/operations-guide.md](docs/operations-guide.md#alert-scenarios).

---

## Architecture & Technology Stack

```text
External Sources (TTC Live Alerts, TTC GTFS-RT, Metrolinx Open API)
       |
       v
Spring Boot Backend (Java 21)
  ├── Ingestion & Normalization Engine (scheduled pollers, source-ID upserts, snapshot tracking)
  ├── Streaming GTFS Importer (bounded 1 GB heap, transactional batches)
  ├── Spatial Domain Layer (PostGIS transit lines, stations, segment matching)
  ├── Redis Live Status Cache (network-scoped, cache eviction upon successful ingestion)
  └── REST API (/api/dashboard, /api/map, /api/alerts, /api/stations, /api/account)
       |
       v
Next.js 15 App Router Frontend
  ├── Server Component Dashboard Entry (with graceful linewatch-data.ts fallback)
  ├── Interactive Map Engine (Dual-layer: pre-rendered raster planes + live SVG React overlays)
  ├── Geographic Map Engine (MapLibre GL JS + OpenFreeMap vector basemaps)
  ├── Unified Sidebar & Responsive Shell (desktop rail / mobile snap sheets)
  └── PWA Service Worker (offline snapshot hydration, high-urgency Web Push display)
```

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, MapLibre GL JS, Lucide Icons |
| **Backend** | Java 21, Spring Boot 3.3, Spring Web, Spring Data JPA / Hibernate Spatial, Flyway |
| **Data & Cache** | PostgreSQL 17 with PostGIS, Redis 7 (append-only persistence) |
| **Production** | Oracle Cloud ARM64 Ampere VPS, Caddy (reverse proxy & auto TLS), Docker Compose |

---

## Verification & Test Tiers

LineWatchTO enforces strict test tiering to allow fast, proportional iteration. See [docs/testing.md](docs/testing.md) for full tier details.

```bash
# Fast unit & contract checks (~1.7s)
npm --prefix frontend run test:fast

# Route type generation & TypeScript check
npm --prefix frontend run typecheck

# Code formatting & lint
npm --prefix frontend run lint

# Script & tooling catalog checks (~150ms)
npm --prefix frontend run test:scripts

# Backend unit & integration test suite (~15s)
mvn -f backend/pom.xml test

# Lean Playwright browser smoke gate (Chromium desktop & mobile)
npm --prefix frontend run test:smoke

# PWA offline hydration test
npm --prefix frontend run test:offline

# Production static build
npm --prefix frontend run build
```

---

## Documentation & Runbooks

Comprehensive guides and technical documentation are maintained in `docs/`:

- **Operations & Runbooks**:
  - [docs/operations-guide.md](docs/operations-guide.md) — Operational scenarios, script routing, and infrastructure summary.
  - [docs/production-vps.md](docs/production-vps.md) — Production Oracle VPS hosting, ARM64 container builds, WireGuard, and deployment.
  - [docs/staging.md](docs/staging.md) — On-demand development server staging stack.
  - [docs/observability.md](docs/observability.md) — Prometheus metrics, Grafana Alloy collector, and Loki container logging.
  - [docs/traffic-spike-runbook.md](docs/traffic-spike-runbook.md) — Traffic surge preparation, caching, and rate limiting.
- **Reference & Specifications**:
  - [docs/script-inventory.md](docs/script-inventory.md) — Comprehensive reference catalog of all 51 repository scripts.
  - [docs/testing.md](docs/testing.md) — Test tiers, Playwright runner isolation, and execution costs.
  - [docs/domain-invariants.md](docs/domain-invariants.md) — Invariants for alerts, freshness, arrivals, and commutes.
  - [docs/source-licensing-launch-gates.md](docs/source-licensing-launch-gates.md) — Data boundaries, Open Government Licence notices, and launch gates.
  - [docs/map-asset-preparation.md](docs/map-asset-preparation.md) — SVG map normalization and multi-plane raster generation.
  - [docs/feature-reference.md](docs/feature-reference.md) — Detailed feature inventory for targeted lookup.
  - [docs/refactor-plan/README.md](docs/refactor-plan/README.md) — Refactoring plan, progress tracking, and session handoffs.

---

## Contributing & Security

- **Contributing**: Please read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, safe fixture practices, test requirements, and generated asset policies.
- **Security**: Security policies and vulnerability reporting procedures are detailed in [SECURITY.md](SECURITY.md). Please report vulnerabilities privately via GitHub Private Vulnerability Reporting.

---

## License & Attribution

This is an unofficial commuter tool and independent software project. It is not affiliated with, endorsed by, or operated by the Toronto Transit Commission (TTC) or Metrolinx.

- Transit names, marks, service colors, and referenced map designs remain the property of TTC, Metrolinx, or their respective owners.
- Derivative schematic maps were independently drawn in Inkscape for application visualization and do not constitute official transit publications.
- Contains information licensed under the **Open Government Licence – Toronto** (applying to City of Toronto open-data inputs, including the official TTC GTFS Realtime dataset).
