# LineWatchTO - Handover Document (Historical Archive)

> [!NOTE]
> **Historical Context (June 1, 2026)**
> This handover document is an archived record of the initial stabilization and ingestion foundation phase completed in June 2026.
> It is **not** an active directive or task list. The roadmap milestones listed here (normalized live alert serving, station arrivals, GTFS geometry matching, commute impact matching, reliability analytics, etc.) have all been implemented and verified.
>
> **Active Entry Points:**
> - [README.md](README.md) — Current overview, capabilities, architecture, and quickstart.
> - [AGENTS.md](AGENTS.md) — Unified agent guide and task routing.
> - [docs/refactor-plan/README.md](docs/refactor-plan/README.md) — Active refactoring roadmap and current handoffs.
> - [docs/feature-reference.md](docs/feature-reference.md) — Comprehensive feature reference.

**Original Date:** 2026-06-01

## 1. Project State & Historical Context (June 2026)
We are building **LineWatchTO** (portfolio project name: **TTC Reliability Navigator**), a polished, high-density transit operations dashboard for Toronto's subway and LRT network. 

The repository is a seeded full-stack dashboard demo with graceful frontend fixture fallback. It is not yet a live TTC dashboard, but the backend now has an opt-in TTC Live Alerts ingestion foundation.

### What Was Just Accomplished:
- **Database & Data Modeling (Backend):** We implemented `hibernate-spatial` with PostgreSQL and PostGIS via Docker Compose. Flyway migrations (`V1` to `V4`) store `stations`, `transit_lines`, `line_segments`, normalized alerts, accessibility outages, alert snapshots, source staging records, and ingestion runs. Seeded segment `geom` values are still nullable and production intersect logic is not implemented.
- **REST APIs (Backend):** Created seeded-demo boundaries for `/api/map`, `/api/status`, and `/api/alerts`. `/api/map` reads seeded stations and SVG paths from repositories. `/api/status` and `/api/alerts` are seeded or hard-coded demo boundaries.
- **TTC Alert Ingestion (Backend):** Added opt-in scheduled polling for `https://alerts.ttc.ca/api/alerts/live-alerts`, raw staging for all route and accessibility records, supported subway/LRT normalization, elevator/escalator outage normalization, source-ID upserts, change snapshots, and durable run tracking. Enable it with `LINEWATCH_INGESTION_ALERTS_ENABLED=true`.
- **Ingestion Health (Backend):** Added `/api/health/ingestion` for the latest poll result. It deliberately returns `dashboardLive=false` because visible dashboard reads have not switched to normalized live records yet.
- **Frontend Decoupling:** Re-wired the Next.js `page.tsx` as a Server Component to fetch the payload from the backend APIs on initial render.
- **Graceful Fallback:** If the backend is offline, `page.tsx` gracefully catches the timeout/error and seamlessly falls back to local fixtures (`linewatch-data.ts`). This is critical for portfolio durability.
- **Playwright Smoke Tests:** Playwright smoke coverage now exercises seeded API and fixture-fallback rendering on desktop and mobile.
- **SVG Map & UI:** The interactive SVG map is fully functional. It renders stations, base paths, and dynamic overlays.
  - Delay segments display **moving orange-and-black hazard stripes** (animated via SVG `<animateTransform>`).
  - Suspended/closed segments display **static red-and-white candy cane stripes**.
  - The map paths pulsate in unison. The "Cardinal North" compass was injected natively into the SVG so it stays anchored to the map during panning and zooming.

## 2. Architecture Stack
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons. Uses a custom `usePanZoom` hook for map interactions and `DataContext` to distribute backend payload to UI components.
- **Backend:** Java 21, Spring Boot, Spring Web, Spring Data JPA, Flyway.
- **Infrastructure:** Docker Compose (PostgreSQL 16 w/ PostGIS, Redis).

## 3. Core Commands
**Start Backend:**
```bash
docker compose up -d postgres redis
mvn -f backend/pom.xml spring-boot:run
```
**Start Frontend:**
```bash
npm --prefix frontend run dev
```
**Verification:**
```bash
npm --prefix frontend run build
mvn -f backend/pom.xml test
```

## 4. Historical Next Steps (Delivered & Verified)
The roadmap milestones identified during the June 2026 phase have all been completed and verified in the current codebase:

1. **User-Facing Live Read Switch (Backend + Frontend):** Implemented via freshness-gated normalized alerts (`AlertDashboardService`) and `/api/dashboard` with offline/fixture fallback.
2. **Live Station Arrivals (Backend + Frontend):** Implemented via TTC GTFS-RT subway predictions and Metrolinx Next Service/TripUpdates with scheduled fallback.
3. **GTFS Geometry & Segment Matching (Backend):** Implemented via streaming GTFS import, PostGIS spatial models, and schematic SVG / vector MapLibre projections.
4. **Commute Impact Engine (Backend):** Implemented via `/api/account/commutes`, granular per-route notification rules, and Web Push notifications.
5. **Reliability Aggregation (Backend):** Implemented via 30-day snapshot observation windows, GTFS daily service overlap, and Redis-cached metrics.

For current engineering work, see [AGENTS.md](AGENTS.md) and [docs/refactor-plan/README.md](docs/refactor-plan/README.md).
