# Global Accessibility Outages And Surface Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global accessibility-outage dashboard and a searchable surface-route service-notice dashboard without changing rapid-transit map/status scoring, saved-commute impact matching, or notification delivery.

**Architecture:** Reuse the existing TTC Live Alerts ingestion as the primary data source. Accessibility outages already normalize into `accessibility_outages`; add a read model over those rows. Surface service changes and bypasses are already staged in `ttc_alert_source_records`; normalize them into a separate surface-notice read model so they remain searchable but do not affect subway/LRT reliability, map overlays, or push notifications.

**Tech Stack:** Java 21, Spring Boot, Spring JDBC/JPA, Flyway, PostgreSQL, Redis dashboard cache, Next.js App Router, React, TypeScript, Tailwind/plain CSS, Node test runner, Playwright.

---

## Gemini 3.5 Flash High Prompt

Use this prompt in a fresh Gemini session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-14-global-accessibility-and-surface-notices.md before editing.

Current request: implement two TTC Live Map parity slices:
1. A global Accessibility Outages menu with elevator/escalator drill-ins grouped by TTC rapid-transit line and station.
2. A searchable Surface Notices menu for TTC service changes, bypasses, detours, and related non-rapid route notices.

Preserve user changes. Run git status before edits. Do not reset or delete unrelated files. Keep LineWatchTO unofficial. Do not claim these notices are notifications, route recommendations, live arrivals, or rapid-transit reliability analytics. Keep fixture fallback available and clearly labeled. Implement one task group at a time with failing tests first.
```

## Current Context

- `frontend/src/app/station-data.ts` already defines station accessibility outage types and fallback station details.
- `frontend/src/components/StationDetailPanel.tsx` already renders the station-scoped `Accessibility Outages` section with:
  - `/assets/linewatch/accessibility-alert.svg`
  - `/assets/linewatch/outages/elevator.svg`
  - `/assets/linewatch/outages/escalator.svg`
- `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java` already reads fresh linked outages through `StationLiveReadRepository`.
- `backend/src/main/java/com/calebhabesh/linewatch/station/StationLiveReadRepository.java` already queries `accessibility_outages` and `accessibility_outage_stations`.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java` intentionally ignores non-rapid route alerts for map/status work.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java` still stages all route records in `ttc_alert_source_records`, including bus/streetcar service changes and bypasses.
- `frontend/src/components/MobileStatusSheet.tsx` is the correct mobile entry point for outage and surface-notice categories.
- `frontend/src/components/LineWatchShell.tsx` owns desktop menu state and mobile sheet routing.

Useful source facts verified on 2026-06-14:

- TTC GTFS-RT exposes service-alert feeds for combined, subway, bus, streetcar, accessibility, and stops, plus trip updates, trip modifications, and vehicle positions at `https://gtfsrt.ttc.ca/`.
- The existing TTC Live Alerts JSON endpoint at `https://alerts.ttc.ca/api/alerts/live-alerts` already includes the surface examples the user referenced, including streetcar bypass records and accessibility records. Prefer this source first because the project already polls it and stores its raw records.
- GTFS-RT remains a later fallback only if the Live Alerts JSON endpoint omits a notice class that TTC Live Map shows.

## Product Decisions

- Global accessibility outages are rider-impacting status information. Add them to the desktop main menu and the mobile `Status` sheet.
- Do not add accessibility outages to map overlays unless a future slice explicitly designs station warning rings from the global view. Station rings already exist for current station-node impacts.
- Do not connect these notices to Web Push in this slice. They are frequent and noisy.
- Surface notices should be searchable and source-linked, but they should not influence:
  - `/api/status`
  - `/api/map`
  - `/api/alerts`
  - saved commute impacts
  - reliability summaries
  - push notifications
- Keep red as service suspension/closed service. Surface route badges may use TTC-style red route pills inside the notice cards, but do not make the whole panel read as critical unless the notice category is `no-service`.
- Fixture/fallback mode should show empty accessibility and surface notices by default. Do not invent active outages or active surface route notices in fixtures.

---

## Task 0: Baseline

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `GEMINI.md`
- Inspect: `README.md`
- Inspect: `frontend/src/components/LineWatchShell.tsx`
- Inspect: `frontend/src/components/MobileStatusSheet.tsx`
- Inspect: `frontend/src/components/StationDetailPanel.tsx`
- Inspect: `backend/src/main/java/com/calebhabesh/linewatch/station/StationLiveReadRepository.java`
- Inspect: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`

- [ ] Run:

```bash
git status --short
```

Expected right now may include unrelated local files such as `view_ttc_alerts.py` and `__pycache__/`. Preserve them unless the user explicitly asks to clean them.

- [ ] Run a fast baseline check:

```bash
npm --prefix frontend run test:fixtures
```

- [ ] If backend work starts immediately, run:

```bash
mvn -f backend/pom.xml test -DskipTests=false
```

Use the failure output as local context; do not claim the baseline is clean unless the commands pass.

---

## Task 1: Backend Global Accessibility Read Model

**Goal:** Add a fresh, cached API surface for global elevator/escalator outage overview and drill-down.

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageController.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageReadRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageResponses.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/accessibility/AccessibilityOutageControllerTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java` only if a dedicated TTL is needed. Otherwise reuse alerts TTL.

### API Contract

Add:

```text
GET /api/accessibility-outages
GET /api/accessibility-outages?asset=elevator
GET /api/accessibility-outages?asset=escalator
```

Response:

```json
{
  "generatedAt": "2026-06-14T15:40:00Z",
  "fresh": true,
  "source": "TTC Live Alerts",
  "assetTypes": [
    {
      "assetType": "elevator",
      "label": "Elevator outages",
      "count": 6,
      "lines": [
        { "lineId": "line-1", "lineNumber": "1", "lineName": "Yonge-University", "color": "#F8C300", "count": 3 },
        { "lineId": "line-2", "lineNumber": "2", "lineName": "Bloor-Danforth", "color": "#00923F", "count": 3 }
      ]
    }
  ],
  "groups": [
    {
      "lineId": "line-1",
      "lineNumber": "1",
      "lineName": "Yonge-University",
      "color": "#F8C300",
      "stations": [
        {
          "stationId": "bloor-yonge",
          "stationName": "Bloor-Yonge",
          "count": 2,
          "outages": [
            {
              "id": "ttc-accessibility-69283",
              "assetType": "elevator",
              "title": "Bloor-Yonge: Elevator out of service...",
              "description": "",
              "cause": "Technical issue",
              "updatedAt": "2026-06-14T11:00:00Z",
              "source": "TTC Live Alerts"
            }
          ]
        }
      ]
    }
  ]
}
```

### Behavior

- If `IngestionFreshness.isDashboardFresh()` is false, return `fresh: false`, empty `assetTypes`, and empty `groups`.
- Count each active outage once per station-line membership. Interchange stations may appear under more than one line, matching the TTC Live Map behavior.
- Sort asset overview as elevator first, escalator second.
- Sort lines by line sort order: 1, 2, 4, 5, 6.
- Sort stations by `station_lines.sort_order`, then station name.
- Sort outage details by latest `coalesce(source_updated_at, updated_at)` first.
- Use `TransitLineEntity` colors, not hard-coded frontend colors.

### Tests

- [ ] Service test: stale ingestion returns empty fresh=false response.
- [ ] Service test: one Bloor-Yonge elevator outage appears under both Line 1 and Line 2.
- [ ] Service test: `asset=elevator` filters out escalators but overview still includes total elevator lines/counts.
- [ ] Service test: unknown asset query either returns HTTP 400 in controller or treats as all. Prefer HTTP 400 with a small error response.
- [ ] Controller test: `/api/accessibility-outages` returns JSON with `assetTypes` and `groups`.
- [ ] Controller test: `/api/accessibility-outages?asset=escalator` calls the filtered service path.

---

## Task 2: Frontend Accessibility Data Adapter

**Goal:** Keep the new API isolated from `linewatch-data.ts` and make frontend fallback empty but typed.

**Files:**
- Create: `frontend/src/app/accessibility-outage-data.ts`
- Test: `frontend/tests/accessibility-outage-data.test.mjs`

### Types

Define:

```ts
export type AccessibilityAssetType = "elevator" | "escalator";
export type AccessibilityOutageResponse = {
  generatedAt: string;
  fresh: boolean;
  source: string;
  assetTypes: AccessibilityOutageAssetSummary[];
  groups: AccessibilityOutageLineGroup[];
};
```

Use names parallel to the backend JSON. Do not import station-detail types directly if that creates circular ownership; duplicate the small outage shape or export a shared `StationFacilityOutage` from `station-data.ts`.

### Fetching

- `getAccessibilityOutages(asset?: AccessibilityAssetType, options?: { fetcher?: typeof fetch; apiBaseUrl?: string })`
- Use same-origin `/api/accessibility-outages` by default through `apiUrl`.
- Return `{ source: "backend" | "fallback", data }`.
- Fallback data:
  - `fresh: false`
  - `source: "LineWatchTO fixture"`
  - empty `assetTypes`
  - empty `groups`

### Tests

- [ ] Uses same-origin API by default.
- [ ] Appends `?asset=elevator` when requested.
- [ ] Falls back empty when fetch throws.
- [ ] Does not invent outage counts in fallback mode.

---

## Task 3: Frontend Accessibility Outages Panel

**Goal:** Add desktop and mobile drill-in UI matching the TTC Live Map pattern while keeping LineWatch styling.

**Files:**
- Create: `frontend/src/components/AccessibilityOutagesPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/MobileStatusSheet.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/accessibility-outages-panel.test.mjs`
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

### UX

Desktop main menu:

- Add `Accessibility Outages` after `Upcoming Closures` and before `Saved Commutes`.
- Use `/assets/linewatch/accessibility-alert.svg` as the menu icon.
- Show a compact badge count from the fetched global response.

Mobile Status sheet:

- Add a status action button titled `Accessibility Outages`.
- Use the same accessibility icon.
- Do not include this count in the bottom-nav `Status` badge unless the user later asks; it should not compete with rapid-transit disruption counts.

Panel first view:

- Header: `Accessibility Outages`.
- Two entry rows:
  - `Elevator outages` with `/assets/linewatch/outages/elevator.svg`
  - `Escalator outages` with `/assets/linewatch/outages/escalator.svg`
- Each row shows:
  - total count in a stable circular badge
  - line preview rows like `1 Yonge-University Line 3 outages`
  - empty state: `No active TTC elevator outages linked to mapped stations.`

Asset drill-in view:

- Back button returns to first view.
- Group by line.
- Each station row shows station name, count, and expand chevron.
- Expanded station shows outage cards with:
  - title
  - description if present
  - cause if present
  - updated relative time using existing `formatRelativeImpactTime`
  - source
- Include a `View Station` button that calls `onSelectStation(stationId)` so users can jump to the existing station panel.

### State Wiring

- Add `ActiveView` value: `"accessibility-outages"`.
- Add `accessibilityOutageResult` state in `LineWatchShell`.
- Fetch on mount and refresh when dashboard refreshes. Keep it independent from `displayData` so backend map fallback does not wipe outage data.
- Pass `onBack` as:
  - desktop: back to `menu`
  - mobile: back to `status`
- Add panel rendering in desktop and mobile branches.

### Tests

- [ ] Source-level test verifies `LineWatchShell.tsx` includes `accessibility-outages` view and mobile status routing.
- [ ] Component source test verifies `AccessibilityOutagesPanel` uses the three existing SVG assets.
- [ ] Component source test verifies station rows expose `aria-expanded`.
- [ ] Mobile UX test verifies `Accessibility Outages` appears in `MobileStatusSheet`, not `MobileMoreSheet`.

---

## Task 4: Surface Notice Persistence And Normalization

**Goal:** Normalize non-rapid TTC Live Alerts route records into a separate searchable model.

**Files:**
- Create migration: `backend/src/main/resources/db/migration/V25__surface_service_notices.sql` or next available version if V25 exists.
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNotice.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeNormalizer.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeStore.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/FeedApplicationCounts.java` only if adding a surface-normalized count is useful.
- Test: `backend/src/test/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeNormalizerTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeStoreTest.java`

### Schema

Use separate tables:

```sql
create table surface_service_notices (
  id varchar(160) primary key,
  source_id varchar(120) not null unique,
  category varchar(40) not null,
  route_type varchar(80),
  title varchar(500) not null,
  description text not null,
  header_text varchar(700),
  url varchar(700),
  effect varchar(80),
  effect_description varchar(160),
  cause varchar(80),
  cause_description varchar(160),
  active_period_start timestamp with time zone,
  active_period_end timestamp with time zone,
  source_updated_at timestamp with time zone,
  active boolean not null default true,
  raw_payload text not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  check (category in ('service-change', 'bypass', 'detour', 'no-service', 'notice'))
);

create table surface_service_notice_routes (
  notice_id varchar(160) not null references surface_service_notices(id) on delete cascade,
  route_id varchar(32) not null,
  sort_order integer not null,
  primary key (notice_id, route_id)
);

create table surface_service_notice_stops (
  notice_id varchar(160) not null references surface_service_notices(id) on delete cascade,
  stop_id varchar(80) not null,
  stop_name varchar(220),
  sort_order integer not null,
  primary key (notice_id, stop_id, sort_order)
);
```

Add indexes:

- `surface_service_notices(active, category)`
- `surface_service_notice_routes(route_id)`
- `surface_service_notice_stops(stop_id)`

### Normalizer Behavior

- Input: `TtcFetchedRecord` from the existing Live Alerts JSON route section.
- Include only non-rapid route records:
  - include route types such as `Bus`, `Streetcar`, and `Stops`
  - exclude `Subway`, `LRT`, `Elevator`, `Escalator`
- Ignore `NO_EFFECT` marketing notices unless they have a URL and route IDs and the product explicitly wants them. Default to ignore.
- Category rules:
  - `effectDesc == "Bypass"` or header/title contains `not stopping` -> `bypass`
  - `effect == "MODIFIED_SERVICE"` or effectDesc contains `Modified` -> `service-change`
  - effect or text contains `detour`, `divert`, or `diverting` -> `detour`
  - `effect == "NO_SERVICE"` and not bypass -> `no-service`
  - otherwise `notice`
- Route IDs:
  - Prefer `record.route()` split on commas.
  - Also support route IDs embedded in `route` for records like `1,84,101`.
  - Trim and dedupe while preserving order.
- Stop details:
  - Use `stopStartId`/`stopEndId` and matching `stopStart`/`stopEnd`.
  - Include `stops` IDs if available, with names from `stopIDList` when names are usable.
- Timing:
  - Use existing `TtcAlertTimes.sourceWallTimeToInstant` conversions, same as route alerts.
  - Treat sentinel year `0001` end as null.
- IDs:
  - `ttc-surface-` + source id.

### Store Behavior

- Upsert active notices by `source_id`.
- Replace route and stop child rows on each upsert.
- Deactivate missing surface notices after each feed application.
- Do not write to `alerts`, `alert_stations`, `alert_segments`, or snapshots.

### Tests

- [ ] Bypass fixture with route `509`, stop id `13366`, `effectDesc=Bypass` normalizes to `category=bypass`.
- [ ] `MODIFIED_SERVICE` route-change fixture with route `88` and URL normalizes to `category=service-change`.
- [ ] Subway/LRT records are ignored by surface normalizer.
- [ ] Accessibility records are ignored by surface normalizer.
- [ ] Store upsert replaces routes/stops and deactivates missing records.

---

## Task 5: Surface Notice Read API

**Goal:** Provide a small searchable surface-notice endpoint for the UI.

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeController.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeReadRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeResponses.java`
- Modify: dashboard cache config if adding a TTL/cache key.
- Test: `backend/src/test/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeControllerTest.java`

### API Contract

Add:

```text
GET /api/surface-notices
GET /api/surface-notices?category=service-change
GET /api/surface-notices?category=bypass
GET /api/surface-notices?query=509
GET /api/surface-notices?category=bypass&query=509
```

Response:

```json
{
  "generatedAt": "2026-06-14T15:40:00Z",
  "fresh": true,
  "source": "TTC Live Alerts",
  "categories": [
    { "category": "service-change", "label": "Service changes", "count": 14 },
    { "category": "bypass", "label": "Bypasses", "count": 4 }
  ],
  "notices": [
    {
      "id": "ttc-surface-69971",
      "category": "bypass",
      "routeType": "Streetcar",
      "routeIds": ["509"],
      "title": "Streetcars are not stopping at Exhibition Loop...",
      "description": "",
      "location": "Exhibition Loop at Manitoba Dr",
      "stopIds": ["13366"],
      "startAt": "2026-06-12T08:52:00Z",
      "endAt": null,
      "updatedAt": "2026-06-12T20:56:58Z",
      "url": "",
      "source": "TTC Live Alerts"
    }
  ]
}
```

### Behavior

- If ingestion is stale, return `fresh: false`, empty categories, empty notices.
- Default limit: 100 notices.
- Hard max limit: 250 notices.
- Search `query` matches exact or prefix route ID first, then title/header/location text.
- For `query=509`, return 509 notices before unrelated text matches.
- Sort active notices:
  - category order: bypass, no-service, detour, service-change, notice
  - route numeric order
  - source updated desc
- Use Redis cache for unfiltered category summaries and common category views. Avoid caching every arbitrary search term unless cache service already handles that cheaply.

### Tests

- [ ] Stale ingestion returns empty response.
- [ ] Query `509` returns only route 509 notice in a mixed fixture.
- [ ] Category `service-change` excludes bypasses.
- [ ] Unknown category returns HTTP 400.
- [ ] Controller serializes category counts and notices.

---

## Task 6: Frontend Surface Notice Adapter And Panel

**Goal:** Add a searchable route-notice menu that feels useful without slowing the map.

**Files:**
- Create: `frontend/src/app/surface-notice-data.ts`
- Create: `frontend/src/components/SurfaceNoticesPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/MobileStatusSheet.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/surface-notice-data.test.mjs`
- Test: `frontend/tests/surface-notices-panel.test.mjs`
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

### UX

Desktop:

- Add a main menu entry after `Accessibility Outages`:
  - label: `Surface Notices`
  - icon: use `Bus` or `Route` from `lucide-react`
  - badge: count of active service changes + bypasses, if fetched

Mobile:

- Add a `Service Changes` / `Surface Notices` entry in `MobileStatusSheet`.
- Keep it below rapid-transit categories and accessibility outages.

Panel:

- Header: `Surface Notices`
- Source label: backend/fallback and last updated if available.
- Segmented category control:
  - `All`
  - `Service Changes`
  - `Bypasses`
  - `Detours`
- Search input:
  - placeholder: `Search route, stop, or notice`
  - debounce 150-250 ms before backend search
  - Enter should submit immediately
- Cards:
  - route badges as red rounded rectangles, matching TTC Live Map screenshots but with LineWatch spacing
  - category pill
  - route type
  - title/summary
  - location/stop IDs for bypasses
  - start/end dates when present
  - source updated time
  - external `View TTC details` link when `url` is present

Performance:

- Do not fetch or render surface notice details until the panel is opened.
- Cache last loaded category in component state.
- Avoid storing all notices in `DashboardData`.
- Do not render hidden panels while closed.

Fallback:

- Empty state: `Surface notices are unavailable in fixture mode.`
- Do not show synthetic route changes.

### Tests

- [ ] Adapter builds `/api/surface-notices?category=bypass&query=509`.
- [ ] Adapter falls back empty when fetch fails.
- [ ] Panel source test verifies search input and category controls exist.
- [ ] Panel source test verifies `View TTC details` links use `target="_blank"` and `rel="noreferrer"`.
- [ ] Mobile UX test verifies mobile `Status` includes service notice entry.

---

## Task 7: Cache, Ingestion Health, And Docs

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheService.java` only if explicit cache-key eviction is hard-coded there.
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java` or wherever alert-ingestion success evicts dashboard keys.
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

### Cache

- Evict:
  - `accessibility-outages:*`
  - `surface-notices:*`
  after successful alert ingestion.
- If using existing cache wrapper with simple string keys, keep names stable:
  - `accessibility-outages:all`
  - `accessibility-outages:elevator`
  - `accessibility-outages:escalator`
  - `surface-notices:summary`
  - `surface-notices:category:<category>`

### Docs

Update README Current Status:

- Add global accessibility outages if implemented and verified.
- Add searchable surface notices only if the backend parser/API and frontend panel pass tests.
- State they use fresh TTC Live Alerts rows and disappear when ingestion is stale.
- State they are not connected to push notifications.

Update AGENTS.md and GEMINI.md together:

- Add global accessibility outage dashboard to Current Reality.
- Add surface notices only after implementation.
- Maintain guardrail: do not claim surface route notices affect rapid-transit map/status/saved-commute scoring.

---

## Suggested Rollout Order

1. Implement Task 1-3 first. This is mostly a read/UI feature over already-normalized outage rows and has low risk.
2. Ship/verify global accessibility outages.
3. Implement Task 4-6 as a separate slice. This touches ingestion and persistence, so it deserves its own verification pass.
4. Update docs only after each slice is working.

## Verification

After Task 1-3:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

After Task 4-6:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

After substantial UI work, also run:

```bash
npm --prefix frontend run test:smoke
```

If dependencies are unavailable, Docker services are down, or browser binaries are missing, report the exact failing command and error.

## Acceptance Criteria

- Desktop main menu has `Accessibility Outages`.
- Mobile `Status` sheet has `Accessibility Outages`.
- Accessibility first view shows elevator/escalator entries with counts and line previews.
- Elevator/escalator drill-ins group stations under line headers.
- Station rows expand to source-labeled outage details.
- Stale ingestion hides live global outage data.
- Surface notices panel is searchable by route number.
- Bypass and service-change categories are distinct.
- Surface notices do not alter rapid-transit map overlays, current line status, saved-commute impacts, or push notifications.
- README, AGENTS.md, and GEMINI.md claims match verified code.
