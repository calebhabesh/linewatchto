# LineWatchTO Stabilization and Playwright Smoke Design

**Date:** 2026-05-31  
**Status:** Approved for implementation planning

## Objective

Stabilize the current LineWatchTO full-stack demo before adding TTC ingestion. The repository should have a green documented verification baseline, a deterministic browser smoke harness, and documentation that accurately separates implemented seeded-demo behavior from planned live-data behavior.

This slice touches frontend, backend verification, and documentation. It does not add live TTC ingestion, real alert normalization, production PostGIS matching, Redis caching, reliability aggregation, or deployment.

## Current State

The dashboard has moved beyond a frontend-only mock:

- Spring Boot exposes seeded-demo `/api/map`, `/api/status`, and `/api/alerts` endpoints.
- PostgreSQL migrations create PostGIS-enabled tables for stations, line segments, normalized alerts, alert-segment links, snapshots, and ingestion runs.
- Next.js fetches the dashboard endpoints from a Server Component and falls back to local fixtures if any required request fails.
- Client-side station summary and detail adapters fetch seeded backend station endpoints with local fallbacks.
- The interactive SVG map uses animated delay patterns, static suspension patterns, clickable stations, panning, zooming, and a map-anchored north compass.

The transition remains incomplete:

- Dashboard status and alert endpoints still return hard-coded seeded-demo responses.
- Seeded line segment geometry currently uses SVG paths and nullable PostGIS geometry.
- Live TTC polling, normalization, deduplication, geospatial impact matching, Redis caching, and historical analytics are not implemented.
- Frontend verification currently has one stale animation assertion, one blocking lint type error, and several lint warnings.
- There is no committed browser smoke-test harness.

## Scope

### Included

- Repair the existing frontend fixture-test assertion so it validates the current SVG pattern-based animation implementation.
- Replace the dashboard ingestion-health `any[]` type with an explicit type.
- Resolve current lint warnings in the touched frontend integration files.
- Make the visible dashboard mode badge respect `generatedAt.live`, so fixture fallback never claims live status.
- Add a committed Playwright smoke-test harness using a lightweight local API stub.
- Verify desktop and mobile dashboard rendering in both seeded API and unavailable-backend modes.
- Keep the existing all-or-nothing dashboard fallback behavior.
- Update `README.md`, `AGENTS.md`, `GEMINI.md`, and `HANDOVER.md` so claims match implemented code.
- Run the documented frontend checks, frontend production build, backend tests, and smoke tests.

### Excluded

- New TTC network calls or source integrations.
- Spring scheduled jobs.
- Alert parsing, normalization, deduplication, or database persistence.
- PostGIS intersect logic or populated geographic line geometry.
- Redis integration.
- Commute-impact backend APIs.
- Reliability aggregation.
- Broad UI redesign.
- Replacing the existing station-data adapter boundary.

## Architecture

### Production Data Flow

The production-facing application behavior remains unchanged:

```text
Next.js Server Component
        |
        +--> GET /api/map
        +--> GET /api/status
        +--> GET /api/alerts
        +--> GET /api/alerts?type=planned
        |
        +--> all requests succeed: render seeded backend demo payload
        |
        +--> any request fails: render complete local fixture payload
```

The all-or-nothing fallback prevents mixed payloads with mismatched alert and segment identifiers.

### Smoke-Test Data Flow

The smoke environment uses a test-only Node HTTP stub rather than Docker or Spring Boot:

```text
Playwright
    |
    +--> local API stub control endpoint
    |       +--> seeded mode
    |       +--> unavailable mode
    |
    +--> Next.js app configured with BACKEND_URL=<stub URL>
            |
            +--> Server Component requests local API stub
```

Browser request interception is intentionally not used for dashboard payloads because the important fetches execute in the Next.js server process.

## Playwright Harness

Add `@playwright/test` as a frontend development dependency. Commit:

- A Playwright configuration.
- A test-only Node API stub.
- Smoke tests.
- Frontend package scripts for running the stubbed smoke suite.

The Playwright configuration starts:

1. The local Node API stub on a dedicated test port.
2. The Next.js development server on a dedicated test port with `BACKEND_URL` pointed to the stub.

The stub provides:

- A control endpoint used by tests to switch response mode.
- Seeded responses for `/api/map`, `/api/status`, `/api/alerts`, and `/api/alerts?type=planned`.
- Unavailable responses for the same dashboard endpoints when fallback mode is selected.
- Deterministic payload values that are visibly distinct from local frontend fixtures.

The smoke suite runs Chromium in:

- A desktop viewport.
- A mobile viewport.

For each viewport, it verifies:

1. Seeded API mode renders the map-first dashboard and a stub-specific value.
2. Seeded API mode does not claim fixture fallback.
3. Unavailable mode renders the local fixture-backed dashboard.
4. Unavailable mode visibly reports fixture mode and does not claim live status.

The initial harness intentionally avoids Docker and Spring Boot prerequisites. Backend controller correctness remains covered by Maven tests, while the browser suite focuses on the Next.js adapter boundary and rendered mode state.

## Frontend Stabilization

### Test Repair

Update the stale source-level map-layering assertion to match the current implementation:

- Delay movement is defined by `<animateTransform>` inside `delay-hash`.
- Suspension styling uses the static `suspension-hash` pattern.
- Existing CSS impact animation coverage remains asserted where applicable.

### Types And Lint

Introduce an explicit ingestion-health item type matching the fixture contract:

```ts
type IngestionHealthItem = {
  label: string;
  value: string;
};
```

Use it in `DashboardData`. Resolve the current lint findings in touched integration files:

- Remove unused catch bindings.
- Add missing `useMemo` dependencies.
- Remove stale lint suppression comments.
- Remove unused destructured values.

### Visible Mode State

The dashboard currently receives a `generatedAt.live` boolean but displays a hard-coded live badge. Render the badge from that boolean:

- Seeded API stub mode can show a live-like seeded status only when the stub payload sets `live: true`.
- Fixture fallback mode shows an explicit fixture/demo status and never displays “Live status.”

This change prevents the fallback dashboard from overstating its data freshness.

## Documentation Alignment

Update documentation to describe the repository as a seeded full-stack demo with graceful fixture fallback.

### Implemented Claims

- PostGIS extension and schema migrations exist.
- Seeded line-segment records and SVG paths exist.
- Seeded-demo `/api/map`, `/api/status`, and `/api/alerts` boundaries exist.
- Next.js Server Component dashboard fetching with local fixture fallback exists.
- Station summary and detail endpoints exist with seeded data.
- Interactive SVG alert overlays and map controls exist.
- Playwright smoke tests cover seeded API and fallback rendering after this slice.

### Explicitly Unimplemented Claims

- Live TTC ingestion.
- Imported GTFS geometry.
- Populated geographic segment geometry suitable for intersect logic.
- Alert normalization and deduplication.
- Redis-backed live cache.
- Commute-impact backend endpoint.
- Reliability aggregation from snapshots.
- Production deployment.

`AGENTS.md` and `GEMINI.md` must remain synchronized.

## Error Handling

- The Node API stub fails fast if its port is unavailable.
- Tests set stub mode before navigating to the dashboard.
- The Next.js Server Component keeps its existing timeout and complete-payload fallback.
- Smoke assertions use rendered UI state rather than internal implementation details wherever possible.
- If Playwright browser binaries are absent locally, installation requirements are reported explicitly rather than hidden.

## Verification

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
mvn -f backend/pom.xml test
```

Also inspect `git status --short` before and after implementation to preserve pre-existing user changes.

## Success Criteria

- All documented verification commands pass.
- Desktop and mobile Playwright projects pass in seeded API and unavailable-backend modes.
- Fixture fallback is clearly visible and does not display a live-status claim.
- Documentation accurately reflects the seeded-demo boundary.
- No live TTC ingestion or production geospatial capability is claimed or implied.
- Pre-existing user changes remain intact.
