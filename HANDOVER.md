# LineWatch TO - Handover Document

**Target Audience:** Codex 5.5xhigh (or any other agent taking over)
**Last Updated:** 2026-06-01

## 1. Project State & Current Reality
We are building **LineWatch TO** (portfolio project name: **TTC Reliability Navigator**), a polished, high-density transit operations dashboard for Toronto's subway and LRT network. 

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

## 4. Next Important Steps (Roadmap)
The "View" and basic "Controller" layer are done. The next major phase is the **Ingestion Engine**.

1. **User-Facing Live Read Switch (Backend + Frontend):** Serve normalized TTC alerts and accessibility outages through the dashboard APIs while retaining fixture mode for demos and tests.
2. **Live Station Arrivals (Backend + Frontend):** Add a public arrival-time provider and replace demo station estimates with source-labeled live predictions.
3. **GTFS Geometry & Segment Matching (Backend):** Import static GTFS shapes and map normalized alerts to PostGIS `line_segments`.
4. **Commute Impact Engine (Backend):** Implement the `POST /api/commutes/impact` endpoint using matched station and segment impacts.
5. **Reliability Aggregation (Backend):** Build duration and frequency summaries from persisted snapshots.

**Guidelines for Codex:**
Please adhere strictly to the rules in `AGENTS.md` and `GEMINI.md`. Do not strip the graceful UI fallback logic, and do not introduce entirely new dependencies unless strictly necessary. Ensure you verify code using the provided CLI commands.
