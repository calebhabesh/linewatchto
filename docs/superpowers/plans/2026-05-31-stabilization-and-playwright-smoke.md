# Stabilization and Playwright Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a green verification baseline, prevent seeded demo data from claiming live TTC status, add deterministic desktop and mobile Playwright coverage for seeded API and fixture-fallback rendering, and align repository documentation with the implemented boundary.

**Architecture:** Keep the production Next.js all-or-nothing dashboard fallback unchanged. Add a test-only Node HTTP stub that serves deterministic seeded dashboard and station-summary payloads or `503` responses, then point the Next.js Server Component and browser-side station adapter at that stub during Playwright runs. Keep the Spring controllers seeded-demo only and make `/api/status` report that honestly.

**Tech Stack:** Next.js App Router, React, TypeScript, Node HTTP server, Node test runner, Playwright Test with Chromium desktop and Pixel 5 emulation, Java 21, Spring Boot, JUnit 5, Mockito, Maven.

---

## File Map

### Existing Files To Modify

- `frontend/tests/map-layering.test.mjs`: replace stale overlay-animation source assertions with checks for the current SVG pattern implementation.
- `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`: report seeded-demo freshness instead of live freshness.
- `frontend/tests/drawer-layout.test.mjs`: assert the rendered mode label is conditional and fixture fallback remains explicit.
- `frontend/src/app/linewatch-data.ts`: export the ingestion-health item type.
- `frontend/src/app/DataContext.tsx`: replace `any[]` with the explicit ingestion-health type.
- `frontend/src/app/page.tsx`: remove the unused catch binding while preserving all-or-nothing fallback.
- `frontend/src/components/InteractiveTtcMap.tsx`: add missing memo dependencies.
- `frontend/src/components/LineWatchShell.tsx`: remove the stale lint suppression and render visible demo/live labels from `generatedAt.live`.
- `frontend/src/components/ReliabilityPanel.tsx`: remove an unused destructured value.
- `frontend/package.json`: add Playwright scripts and the Playwright development dependency.
- `frontend/package-lock.json`: capture the dependency-lock update produced by npm.
- `README.md`: describe seeded full-stack demo behavior, fallback behavior, and browser checks accurately.
- `AGENTS.md`: update agent guidance to the verified repository state.
- `GEMINI.md`: keep the Gemini guidance synchronized with `AGENTS.md`.
- `HANDOVER.md`: correct overstatements and record the stabilization baseline.

### New Files To Create

- `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`: lock the seeded-demo status contract.
- `frontend/playwright.config.ts`: start the API stub and Next.js, then run Chromium desktop and mobile projects.
- `frontend/tests/smoke/api-stub-data.mjs`: hold deterministic smoke payloads.
- `frontend/tests/smoke/api-stub.mjs`: expose the smoke API server and mode-control endpoint.
- `frontend/tests/smoke/dashboard.spec.ts`: verify seeded API and unavailable-backend dashboard rendering.

### Existing User Files To Preserve

Do not remove or overwrite unrelated working-tree changes. In particular, preserve the edits already present in:

- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`
- `backend/src/main/resources/db/migration/V2__add_postgis_schema.sql`
- `backend/src/main/resources/db/migration/V3__map_segments_seed.sql`
- `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- `frontend/src/app/linewatch-data.ts`
- `HANDOVER.md`
- `frontend/test-portal.mjs`
- `frontend/test-split.mjs`

Before staging each commit, inspect `git diff --cached --name-status` and stage only the files named by that task.

---

### Task 1: Repair The Stale SVG Animation Assertion

**Files:**
- Modify: `frontend/tests/map-layering.test.mjs:22`

- [ ] **Step 1: Confirm the existing focused test fails**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: FAIL because the test still searches for `delay-anim`, while the current implementation uses `delay-hash`, `delay-candy`, and SVG `<animateTransform>`.

- [ ] **Step 2: Replace the stale assertions with current pattern assertions**

Replace the final test body with:

```js
  it("renders animated visual effects for delays, closures, and station impacts", () => {
    assert.match(interactiveMapSource, /<pattern id="suspension-hash"/);
    assert.match(interactiveMapSource, /<pattern id="delay-hash"/);
    assert.match(interactiveMapSource, /<animateTransform attributeName="patternTransform"/);
    assert.match(interactiveMapSource, /className="asset-alert-path delay-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /stroke:\s*"url\(#delay-hash\)"/);
    assert.match(interactiveMapSource, /className="asset-alert-path suspension-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /stroke:\s*"url\(#suspension-hash\)"/);
    assert.match(globalCss, /@keyframes pulse-impact/);
  });
```

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: PASS with `3` passing tests.

- [ ] **Step 4: Run the full fixture suite**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS with all fixture suites green.

- [ ] **Step 5: Commit the test repair**

```bash
git add frontend/tests/map-layering.test.mjs
git diff --cached --name-status
git commit -m "test(frontend): align map animation assertions"
```

Expected staged file: only `frontend/tests/map-layering.test.mjs`.

---

### Task 2: Make The Seeded Backend Status Contract Honest

**Files:**
- Create: `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java:27`

- [ ] **Step 1: Write a failing controller test**

Create `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`:

```java
package com.calebhabesh.linewatch.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import org.junit.jupiter.api.Test;

class StatusControllerTest {

    @Test
    void statusMarksSeededBackendPayloadAsDemoData() {
        TransitLineRepository repository = mock(TransitLineRepository.class);
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1)
        ));
        StatusController controller = new StatusController(repository);

        StatusController.StatusResponse response = controller.getStatus();

        assertThat(response.generatedAt().live()).isFalse();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("Seeded backend demo");
        assertThat(response.lines()).hasSize(1);
    }
}
```

- [ ] **Step 2: Run the focused backend test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StatusControllerTest test
```

Expected: FAIL because `/api/status` currently returns `live=true` and `lastPoll="52 sec ago"`.

- [ ] **Step 3: Change the generated-at metadata**

In `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`, replace:

```java
new GeneratedAtDto("9:24 PM", "Mon, Feb 16", true, "52 sec ago"),
```

with:

```java
new GeneratedAtDto("Seeded demo", "Fixture data", false, "Seeded backend demo"),
```

Do not alter the seeded line-status fixture content in this task.

- [ ] **Step 4: Run the focused backend test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StatusControllerTest test
```

Expected: PASS with `1` test.

- [ ] **Step 5: Run the backend suite**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS with the existing backend tests plus `StatusControllerTest`.

- [ ] **Step 6: Commit the seeded-status correction**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java \
  backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java
git diff --cached --name-status
git commit -m "fix(backend): label seeded status payload as demo data"
```

Expected staged files: only the status controller and its new test.

---

### Task 3: Repair Frontend Types, Lint, And Visible Mode State

**Files:**
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/app/DataContext.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/ReliabilityPanel.tsx`

- [ ] **Step 1: Add a failing source-level mode-state assertion**

In `frontend/tests/drawer-layout.test.mjs`, add:

```js
const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
```

Then add this test inside `describe("floating menu layout", ...)`:

```js
  it("labels fallback mode without claiming live TTC status", () => {
    assert.match(pageSource, /Backend offline \(Fixture mode\)/);
    assert.match(shellSource, /generatedAt\.live \? "Live status" : "Demo status"/);
    assert.match(shellSource, /data-testid="menu-dashboard-data-mode"/);
  });
```

- [ ] **Step 2: Run the focused source-level test to verify it fails**

Run:

```bash
node --test frontend/tests/drawer-layout.test.mjs
```

Expected: FAIL because `LineWatchShell` still renders a hard-coded `Live status` badge and has no menu mode marker.

- [ ] **Step 3: Export and use an explicit ingestion-health type**

In `frontend/src/app/linewatch-data.ts`, add after `ReliabilitySummary`:

```ts
export type IngestionHealthItem = {
  label: string;
  value: string;
  state: "ok";
};
```

Annotate the fixture:

```ts
export const ingestionHealth: IngestionHealthItem[] = [
```

In `frontend/src/app/DataContext.tsx`, import `IngestionHealthItem` and replace:

```ts
  ingestionHealth: any[];
```

with:

```ts
  ingestionHealth: IngestionHealthItem[];
```

- [ ] **Step 4: Remove the unused catch binding**

In `frontend/src/app/page.tsx`, replace:

```ts
  } catch (e) {
```

with:

```ts
  } catch {
```

- [ ] **Step 5: Add the missing memo dependencies**

In `frontend/src/components/InteractiveTtcMap.tsx`, use:

```ts
  const selectedAlert = useMemo(() => {
    return activeAlerts.find((a) => a.id === selectedAlertId);
  }, [activeAlerts, selectedAlertId]);

  const selectedClosure = useMemo(() => {
    return plannedClosures.find((c) => c.id === selectedClosureId);
  }, [plannedClosures, selectedClosureId]);
```

and:

```ts
  }, [networkSegments, selectedClosure]);
```

for the `overlaySegments` memo.

- [ ] **Step 6: Render visible mode labels from `generatedAt.live`**

In `frontend/src/components/LineWatchShell.tsx`, add below the initial-data destructuring:

```ts
  const dataModeLabel = generatedAt.live ? "Live status" : "Demo status";
```

Replace the ingestion-health heading wrapper with:

```tsx
                   <div className="flex flex-wrap items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-2">
                     <ShieldCheck size={16} />
                     <span className="text-[11px] font-bold uppercase tracking-wider">Ingestion Health (Poll: {generatedAt.lastPoll})</span>
                     <span
                       data-testid="menu-dashboard-data-mode"
                       className="ml-auto text-[10px] font-bold uppercase tracking-wider"
                     >
                       {dataModeLabel}
                     </span>
                   </div>
```

Replace the hard-coded desktop badge with:

```tsx
            <b
              data-testid="dashboard-data-mode"
              className="text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 px-2.5 py-0.5 rounded-full border border-green-500/20"
            >
              {dataModeLabel}
            </b>
```

Remove only the unused `eslint-disable-next-line react-hooks/set-state-in-effect` comment reported by lint. Keep the suppression that still guards an active lint diagnostic.

- [ ] **Step 7: Remove the unused analytics destructuring**

In `frontend/src/components/ReliabilityPanel.tsx`, replace:

```ts
  const { reliabilitySummaries, ingestionHealth } = useDashboardData();
```

with:

```ts
  const { reliabilitySummaries } = useDashboardData();
```

- [ ] **Step 8: Run the focused source-level test**

Run:

```bash
node --test frontend/tests/drawer-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Run frontend fixture, type, and lint checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS with no lint errors or warnings. If lint identifies that the other `set-state-in-effect` suppression is also unused after edits, remove that comment and rerun lint.

- [ ] **Step 10: Commit the frontend stabilization**

```bash
git add frontend/tests/drawer-layout.test.mjs \
  frontend/src/app/linewatch-data.ts \
  frontend/src/app/DataContext.tsx \
  frontend/src/app/page.tsx \
  frontend/src/components/InteractiveTtcMap.tsx \
  frontend/src/components/LineWatchShell.tsx \
  frontend/src/components/ReliabilityPanel.tsx
git diff --cached --name-status
git commit -m "fix(frontend): surface demo mode and clear lint baseline"
```

Expected staged files: only the seven frontend source files and the source-level test. Preserve the pre-existing segment correction already present in `frontend/src/app/linewatch-data.ts`.

---

### Task 4: Add Deterministic Desktop And Mobile Playwright Smoke Tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/tests/smoke/api-stub-data.mjs`
- Create: `frontend/tests/smoke/api-stub.mjs`
- Create: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Install the Playwright test dependency**

Run:

```bash
npm --prefix frontend install --save-dev @playwright/test
```

Expected: npm adds `@playwright/test` to `frontend/package.json` and updates `frontend/package-lock.json`. If sandboxed network access fails, rerun with the required approval.

- [ ] **Step 2: Add smoke-test package scripts**

In `frontend/package.json`, extend `scripts` with:

```json
    "test:smoke": "playwright test",
    "test:smoke:install": "playwright install chromium"
```

- [ ] **Step 3: Create the Playwright configuration**

Create `frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/smoke/api-stub.mjs",
      url: `${stubUrl}/__test/health`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command:
        "BACKEND_URL=http://127.0.0.1:4174 NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 npm run dev -- --hostname 127.0.0.1 --port 4173",
      url: appUrl,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
```

- [ ] **Step 4: Create a minimal stub skeleton**

Create `frontend/tests/smoke/api-stub.mjs`:

```js
import { createServer } from "node:http";

const port = Number(process.env.LINEWATCH_STUB_PORT ?? "4174");
let mode = "seeded";

function sendJson(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-origin": "*",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/__test/health") {
    sendJson(response, 200, { mode });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__test/mode") {
    const body = await readJson(request);
    if (!["seeded", "unavailable"].includes(body.mode)) {
      sendJson(response, 400, { error: "Unsupported smoke stub mode" });
      return;
    }
    mode = body.mode;
    sendJson(response, 200, { mode });
    return;
  }

  sendJson(response, 503, { error: "Smoke API payloads are not wired yet" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LineWatch smoke API stub listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 5: Write the failing browser tests**

Create `frontend/tests/smoke/dashboard.spec.ts`:

```ts
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const stubUrl = "http://127.0.0.1:4174";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "unavailable") {
  const response = await request.post(`${stubUrl}/__test/mode`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

async function openDashboardMenu(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle menu" }).click();
}

test("renders the seeded dashboard API payload", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page);

  await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
  await expect(page.getByText("Ingestion Health (Poll: Stub API poll)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);
});

test("renders fixture fallback when the dashboard API is unavailable", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await openDashboardMenu(page);

  await expect(
    page.getByText("Ingestion Health (Poll: Backend offline (Fixture mode))", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("menu-dashboard-data-mode")).toHaveText("Demo status");
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 6: Install the Chromium browser binary**

Run:

```bash
npm --prefix frontend run test:smoke:install
```

Expected: Playwright installs the Chromium browser binary. If sandboxed network access fails, rerun with the required approval. If host-library installation is required, report the exact Playwright error before requesting broader system changes.

- [ ] **Step 7: Run one seeded smoke test to verify it fails**

Run:

```bash
npm --prefix frontend run test:smoke -- --project=desktop-chromium -g "renders the seeded dashboard API payload"
```

Expected: FAIL because the stub skeleton returns `503`, forcing frontend fixture fallback instead of rendering `Stub API Yonge-University`.

- [ ] **Step 8: Add deterministic seeded smoke data**

Create `frontend/tests/smoke/api-stub-data.mjs`:

```js
export const mapResponse = {
  stations: [
    { id: "stub-station", name: "Stub Station", x: 4547, y: 1808, interchange: false },
  ],
  segments: [
    {
      id: "stub-line-1-segment",
      lineId: "line-1",
      label: "Stub Station to Stub Terminal",
      pathD: "M 4547 1808 L 4546 1086",
      overlay: "suspension",
      alertId: "stub-alert-line-1",
    },
  ],
};

export const statusResponse = {
  generatedAt: {
    time: "Seeded demo",
    date: "Smoke fixture",
    live: false,
    lastPoll: "Stub API poll",
  },
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Stub API Yonge-University",
      route: "Stub Station - Stub Terminal",
      color: "#f4c430",
      status: "suspension",
      statusLabel: "Suspended",
      summary: "Stub API suspension for browser verification.",
      updatedAgo: "Seeded demo",
    },
  ],
};

export const activeAlertsResponse = [
  {
    id: "stub-alert-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API signal problem",
    severity: "suspension",
    location: "Stub Station to Stub Terminal",
    description: "Seeded smoke alert for browser verification.",
    updatedAgo: "Seeded demo",
    affectedSegmentIds: ["stub-line-1-segment"],
    shuttle: true,
    source: "Playwright API stub",
  },
];

export const plannedClosuresResponse = [
  {
    id: "stub-closure-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API weekend closure",
    window: "Seeded smoke window",
    location: "Stub Station to Stub Terminal",
    description: "Seeded smoke closure for browser verification.",
    previewSegmentIds: ["stub-line-1-segment"],
    shuttle: false,
    source: "Playwright API stub",
  },
];

export const stationSummariesResponse = {
  generatedAt: "seeded-smoke",
  stations: [
    {
      id: "stub-station",
      name: "Stub Station",
      mapX: 4547,
      mapY: 1808,
      interchange: false,
      lineIds: ["line-1"],
      hasActiveImpact: true,
      accessStatus: "normal",
    },
  ],
};
```

- [ ] **Step 9: Wire the complete stub routes**

At the top of `frontend/tests/smoke/api-stub.mjs`, add:

```js
import {
  activeAlertsResponse,
  mapResponse,
  plannedClosuresResponse,
  stationSummariesResponse,
  statusResponse,
} from "./api-stub-data.mjs";
```

Before the final `503` response, add:

```js
  if (mode === "unavailable" && url.pathname.startsWith("/api/")) {
    sendJson(response, 503, { error: "Smoke stub unavailable mode" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map") {
    sendJson(response, 200, mapResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, statusResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/alerts") {
    sendJson(
      response,
      200,
      url.searchParams.get("type") === "planned" ? plannedClosuresResponse : activeAlertsResponse
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stations") {
    sendJson(response, 200, stationSummariesResponse);
    return;
  }
```

Change the final response to:

```js
  sendJson(response, 404, { error: "Unknown smoke API route" });
```

- [ ] **Step 10: Run the desktop seeded smoke test**

Run:

```bash
npm --prefix frontend run test:smoke -- --project=desktop-chromium -g "renders the seeded dashboard API payload"
```

Expected: PASS with `1` test.

- [ ] **Step 11: Run the complete smoke suite**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS with `4` tests: seeded API and fixture fallback under `desktop-chromium` and `mobile-chromium`.

- [ ] **Step 12: Commit the browser harness**

```bash
git add frontend/package.json \
  frontend/package-lock.json \
  frontend/playwright.config.ts \
  frontend/tests/smoke/api-stub-data.mjs \
  frontend/tests/smoke/api-stub.mjs \
  frontend/tests/smoke/dashboard.spec.ts
git diff --cached --name-status
git commit -m "test(frontend): add seeded and fallback playwright smoke coverage"
```

Expected staged files: only the dependency files, Playwright config, and smoke-test files.

---

### Task 5: Align Documentation With The Seeded Full-Stack Demo

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Update README current-state claims**

In `README.md`, revise `## Current Status` so it explicitly says:

```markdown
The current app is a seeded full-stack demo with a graceful local-fixture fallback. Next.js fetches seeded Spring Boot dashboard boundaries on initial render when the backend is available and falls back to typed local fixtures when any required dashboard request fails. The data remains demo data: live TTC ingestion is not implemented.
```

Ensure the implemented list includes:

```markdown
- PostGIS-enabled Flyway schema for stations, transit lines, line segments, alerts, alert-segment links, snapshots, and ingestion runs.
- Seeded `/api/map`, `/api/status`, and `/api/alerts?type=live|planned` demo boundaries.
- Next.js Server Component dashboard loading with complete local-fixture fallback.
- Playwright Chromium smoke tests for seeded API and fallback rendering on desktop and mobile viewports.
```

Ensure the not-implemented list includes:

```markdown
- Live TTC service-alert ingestion.
- Static GTFS import.
- Populated geographic segment geometry for PostGIS intersect logic.
- Alert normalization and deduplication.
- Redis-backed live status cache.
- Backend commute-impact endpoint.
- Real historical reliability aggregation.
- Deployment.
```

- [ ] **Step 2: Update README commands and backend boundary table**

Add:

```bash
npm --prefix frontend run test:smoke
```

to frontend verification. Split the backend table into implemented seeded-demo endpoints and planned endpoints. The implemented table must include:

```markdown
| `GET` | `/api/health` | Backend service health. |
| `GET` | `/api/map` | Seeded stations and SVG-backed line segments. |
| `GET` | `/api/status` | Seeded line status demo payload. |
| `GET` | `/api/alerts?type=live\|planned` | Hard-coded live-style or planned demo alerts. |
| `GET` | `/api/stations?query={q}` | Seeded station summaries and search. |
| `GET` | `/api/stations/{id}` | Seeded station detail payload. |
```

Keep commute impact, reliability, and ingestion-health endpoints in the planned table. Reorder the roadmap so completed seeded schema, boundary, adapter, and smoke-test work is no longer described as pending.

- [ ] **Step 3: Update agent guidance and keep both copies identical**

Update `AGENTS.md`:

- Set `Last updated: 2026-05-31`.
- Describe seeded PostGIS migrations, seeded demo dashboard APIs, Server Component loading, fixture fallback, station APIs, and Playwright smoke coverage in `## Current Reality`.
- Continue to prohibit claims of live TTC data, imported GTFS geometry, production geospatial matching, Redis-backed status, or real analytics.
- Add `npm --prefix frontend run test:smoke` to core frontend commands and substantial frontend verification.
- Replace “The current backend only exposes health” with an accurate seeded-demo boundary summary.
- Advance the suggested implementation order past completed schema, map-boundary, adapter, and smoke-test tasks.

Copy the completed `AGENTS.md` content to `GEMINI.md`, then verify identity:

```bash
cmp -s AGENTS.md GEMINI.md
```

Expected: exit code `0`.

- [ ] **Step 4: Correct the handover document**

Update `HANDOVER.md` to state:

```markdown
The repository is a seeded full-stack demo with graceful frontend fixture fallback. It is not yet a live TTC dashboard.
```

Clarify that:

- The PostGIS schema exists, but seeded segment `geom` values are still nullable and production intersect logic is not implemented.
- `/api/map` reads seeded stations and SVG paths from repositories.
- `/api/status` and `/api/alerts` are seeded or hard-coded demo boundaries.
- Playwright smoke coverage now exercises seeded API and fixture-fallback rendering on desktop and mobile.
- Live ingestion, normalization, populated geographic geometry, Redis caching, commute impact, and historical analytics remain future work.

- [ ] **Step 5: Review documentation for overclaims**

Run:

```bash
rg -n 'only exposes health|PostGIS transit geometry schema|Backend `/api/map`|Add browser smoke tests|Introduce Playwright|fully decoupled|live TTC dashboard|live status cache' README.md AGENTS.md GEMINI.md HANDOVER.md
```

Expected: no stale claims that schema, seeded boundaries, or smoke tests are missing; no claim that demo data is live TTC data.

- [ ] **Step 6: Commit documentation alignment**

```bash
git add README.md AGENTS.md GEMINI.md HANDOVER.md
git diff --cached --name-status
git commit -m "docs: align project claims with seeded demo boundary"
```

Expected staged files: only the four documentation files.

---

### Task 6: Run Full Verification And Inspect The Final Worktree

**Files:**
- No planned edits.

- [ ] **Step 1: Run frontend fixture checks**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS with no warnings.

- [ ] **Step 4: Run the frontend production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run Playwright desktop and mobile smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS with `4` smoke tests.

- [ ] **Step 6: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS with the existing backend suite plus `StatusControllerTest`.

- [ ] **Step 7: Verify synchronized guidance and inspect preserved changes**

Run:

```bash
cmp -s AGENTS.md GEMINI.md
git status --short
git log --oneline --decorate -8
```

Expected:

- `cmp` exits `0`.
- The stabilization commits are present.
- Pre-existing unrelated user changes remain intact unless they were deliberately included in a scoped task.
- `frontend/test-portal.mjs` and `frontend/test-split.mjs` remain untouched unless the user separately approves their cleanup.

- [ ] **Step 8: Start the local frontend for user inspection**

Run:

```bash
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: Next.js starts successfully. Report `http://127.0.0.1:3000` to the user and keep the server session running for inspection.
