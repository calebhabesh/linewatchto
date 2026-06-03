# Alert Scenario Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-owned TTC alert scenario harness so LineWatch TO can manually and automatically test active alerts, ordinary delays, Reduced Speed Zones, planned closures, accessibility outages, station-node impacts, and nonlinear map overlays.

**Architecture:** Keep the real ingestion path intact. Store TTC-shaped scenario feeds as generated JSON fixtures, generate them from one small Node scenario catalog, serve any scenario through a local mock TTC feed for browser testing, and add focused backend/frontend regression tests over the same catalog. The harness is dev/test-only and must never make LineWatch TO look official or claim live data unless the backend ingested a fresh source.

**Tech Stack:** Java 21, Spring Boot 3.5, Jackson, Maven, Node.js built-ins, Next.js App Router, React, TypeScript, Node test runner, Playwright Chromium.

---

## Handoff Prompt For Gemini 3.5 Flash High

Use this prompt in the implementation session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatch TO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-03-alert-scenario-harness.md before editing.

Implement the alert scenario harness task-by-task. Preserve all existing user changes. Start with git status --short and do not reset, checkout, delete, or rewrite unrelated files. This repo currently has many modified frontend/backend files and an untracked scripts/mock-alerts-server.js prototype; treat them as user work and only edit that prototype if you are replacing it with the scenario-aware mock server described in this plan.

Do not add dependencies. Do not claim imported GTFS, production segment matching, Redis-backed status, live arrivals, or official TTC status. Run the verification commands in each task and report exact failures if local services or sandboxing block them.
```

## Current Context

- The backend already has TTC Live Alerts ingestion, normalization, raw staging, alert snapshots, dashboard read models, freshness suppression, and `/api/health/ingestion`.
- The backend already has tests for parsing, normalization, persistence, RSZ projection, segment matching, map DTO impacts, and alert controllers.
- The frontend already has tests for map guide paths, map geometry fallback, fixture data, API-stub smoke rendering, overlay clicks, station rings, and raw logs.
- `backend/src/test/resources/fixtures/ttc-synthetic-alerts.json` is the only committed TTC feed fixture envelope.
- The user has three external sample alert objects:
  - `~/Pictures/Assets/LineWatch/sample1.json`
  - `~/Pictures/Assets/LineWatch/sample2.json`
  - `~/Pictures/Assets/LineWatch/sample3.json`
- `scripts/mock-alerts-server.js` currently exists as an untracked prototype that serves only `sample3.json`. Replace or wrap it only inside the scenario-server task.

## Scope

Included:

- A deterministic scenario catalog with generated JSON feed fixtures.
- Scenarios for all alert categories and nonlinear map sections:
  - active suspension
  - ordinary delay
  - Reduced Speed Zone
  - planned closure with child windows
  - accessibility outage
  - Union curve
  - St Andrew to Union curve
  - Spadina to St George curve
  - Dupont to Spadina curve
  - Line 5 Avenue to Leaside suspension
  - single-station Keele impact ring
- A local scenario feed server for manual backend/browser testing.
- A convenience script that runs the backend against one scenario.
- Backend tests proving every scenario parses and normalizes.
- Backend map/controller tests proving nonlinear guide metadata can be exposed with impacts.
- Frontend fixture tests proving generated scenario metadata references existing SVG guide paths.
- Playwright smoke coverage for a nonlinear RSZ overlay click through the existing API stub.
- README/agent-doc updates explaining how to use the harness.

Deferred:

- Capturing live TTC feeds automatically.
- Scraping TTC web pages.
- Importing GTFS geometry.
- Production alert-to-segment matching.
- Redis caching.
- Commute impact and reliability aggregation.

## File Structure

Create:

- `scripts/alert-scenario-catalog.mjs`: source-of-truth scenario builder used by generated fixtures and the mock feed server.
- `scripts/generate-alert-scenarios.mjs`: writes stable JSON fixtures from the catalog.
- `scripts/mock-alerts-server.mjs`: serves one dynamic scenario as a TTC Live Alerts-compatible endpoint.
- `scripts/dev-alert-scenario.sh`: starts the scenario server and Spring backend wired to it.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/all-alert-types.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/nonlinear-union-curve.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/nonlinear-st-george-spadina.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/line-5-suspension.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/nightly-closure-active-window.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/station-node-impact.json`: generated fixture.
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/scenario-index.json`: generated fixture index.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java`: parser/normalizer regression over all generated scenario feeds.
- `frontend/tests/alert-scenario-catalog.test.mjs`: JSON catalog and SVG nonlinear-guide consistency tests.

Modify:

- `scripts/mock-alerts-server.js`: keep backward compatibility by turning it into a CommonJS wrapper that launches `mock-alerts-server.mjs`.
- `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`: add guide-path impact regression.
- `frontend/tests/smoke/api-stub-data.mjs`: add nonlinear scenario stub data.
- `frontend/tests/smoke/dashboard.spec.ts`: add nonlinear overlay smoke test.
- `README.md`: document manual scenario testing.
- `AGENTS.md` and `GEMINI.md`: mention the scenario harness and keep both files aligned.

## Task 0: Baseline Check

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `GEMINI.md`
- Inspect: `README.md`
- Inspect: `scripts/mock-alerts-server.js`
- Inspect: files from `git status --short`

- [ ] **Step 1: Check the worktree**

Run:

```bash
git status --short
```

Expected: there may be many modified files and untracked files. Preserve them. Do not clean the tree.

- [ ] **Step 2: Read the project instructions**

Run:

```bash
sed -n '1,320p' AGENTS.md
sed -n '1,320p' GEMINI.md
sed -n '1,260p' README.md
```

Expected: confirm the project name is LineWatch TO and that this is not an official TTC product.

- [ ] **Step 3: Inspect the current prototype server**

Run:

```bash
sed -n '1,220p' scripts/mock-alerts-server.js
```

Expected: the prototype serves `~/Pictures/Assets/LineWatch/sample3.json` only. Keep its intent, but replace its implementation with the scenario-aware wrapper in Task 3.

## Task 1: Add Scenario Catalog Source

**Files:**
- Create: `scripts/alert-scenario-catalog.mjs`
- Create: `scripts/generate-alert-scenarios.mjs`

- [ ] **Step 1: Create the scenario catalog**

Create `scripts/alert-scenario-catalog.mjs`:

```javascript
const DEFAULT_NOW = "2026-06-03T15:00:00.000Z";
const SENTINEL_END = "0001-01-01T00:00:00Z";

export const scenarioNames = [
  "all-alert-types",
  "nonlinear-union-curve",
  "nonlinear-st-george-spadina",
  "line-5-suspension",
  "nightly-closure-active-window",
  "station-node-impact",
];

export const scenarioExpectations = {
  "all-alert-types": {
    routeCount: 4,
    accessibilityCount: 1,
    impactKinds: ["suspension", "delay", "reduced-speed-zone", "planned-closure"],
    guidePathIds: [],
  },
  "nonlinear-union-curve": {
    routeCount: 3,
    accessibilityCount: 0,
    impactKinds: ["suspension", "reduced-speed-zone"],
    guidePathIds: ["seg-line-1-union-king", "seg-line-1-st-andrew-union"],
  },
  "nonlinear-st-george-spadina": {
    routeCount: 2,
    accessibilityCount: 0,
    impactKinds: ["delay", "reduced-speed-zone"],
    guidePathIds: ["seg-line-1-spadina-st-george", "seg-line-1-dupont-spadina"],
  },
  "line-5-suspension": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["suspension"],
    guidePathIds: [],
  },
  "nightly-closure-active-window": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["planned-closure"],
    guidePathIds: [],
  },
  "station-node-impact": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["delay"],
    guidePathIds: [],
  },
};

function dateFrom(value) {
  return value instanceof Date ? value : new Date(value);
}

function iso(now, offsetMinutes) {
  return new Date(dateFrom(now).getTime() + offsetMinutes * 60_000).toISOString();
}

function currentPeriod(now, startOffset = -30) {
  return { start: iso(now, startOffset), end: SENTINEL_END };
}

function finitePeriod(now, startOffset, endOffset) {
  return { start: iso(now, startOffset), end: iso(now, endOffset) };
}

function routeAlert(now, overrides) {
  const line = overrides.route ?? "1";
  const title = overrides.title ?? "LineWatch scenario alert";
  return {
    id: overrides.id,
    priority: 0,
    alertType: overrides.alertType ?? "Live",
    lastUpdated: iso(now, overrides.updatedOffset ?? -5),
    activePeriod: overrides.activePeriod ?? currentPeriod(now),
    activePeriodGroup: overrides.activePeriodGroup ?? ["Current"],
    routeOrder: Number(line),
    route: line,
    routeBranch: "",
    routeTypeSrc: "400",
    routeType: overrides.routeType ?? "Subway",
    stopStart: overrides.stopStart,
    stopEnd: overrides.stopEnd,
    stopStartId: null,
    stopEndId: null,
    stops: overrides.stops ?? [],
    title,
    description: overrides.description ?? "",
    url: overrides.url ?? "",
    urlPlaceholder: "",
    accessibility: "Routes",
    effect: overrides.effect,
    effectDesc: overrides.effectDesc,
    severityOrder: overrides.severityOrder ?? 1,
    severity: overrides.severity ?? "Critical",
    customHeaderText: null,
    headerText: overrides.headerText ?? `Line ${line}: ${title}`,
    direction: overrides.direction ?? "Both ways",
    cause: overrides.cause ?? null,
    causeDescription: overrides.causeDescription ?? null,
    stopIDList: overrides.stopIDList ?? [overrides.stopStart, overrides.stopEnd],
    stopNameList: [],
    stopRouteList: [],
    rszLength: overrides.rszLength ?? null,
    distance: overrides.distance ?? null,
    trackPercent: overrides.trackPercent ?? null,
    reducedSpeed: overrides.reducedSpeed ?? null,
    averageSpeed: overrides.averageSpeed ?? null,
    targetRemoval: overrides.targetRemoval ?? null,
    shuttleType: overrides.shuttleType ?? null,
    shuttleStart: overrides.shuttleStart ?? null,
    shuttleEnd: overrides.shuttleEnd ?? null,
    elevatorCode: null,
    escalatorCode: null,
    criticality: 0,
    childAlerts: overrides.childAlerts ?? [],
  };
}

function accessibilityAlert(now, overrides) {
  const title = overrides.title ?? "Elevator outage";
  return {
    id: overrides.id,
    priority: 0,
    alertType: "Live",
    lastUpdated: iso(now, overrides.updatedOffset ?? -5),
    activePeriod: currentPeriod(now),
    activePeriodGroup: ["Current"],
    routeOrder: 0,
    route: null,
    routeBranch: "",
    routeTypeSrc: "",
    routeType: overrides.routeType,
    stopStart: null,
    stopEnd: null,
    stopStartId: null,
    stopEndId: null,
    stops: [],
    title,
    description: overrides.description ?? "",
    url: "",
    urlPlaceholder: "",
    accessibility: "Accessibility",
    effect: "ACCESSIBILITY_ISSUE",
    effectDesc: "Out of service",
    severityOrder: 2,
    severity: "Moderate",
    customHeaderText: null,
    headerText: overrides.headerText,
    direction: null,
    cause: overrides.cause ?? "MAINTENANCE",
    causeDescription: overrides.causeDescription ?? "Technical issue",
    stopIDList: [],
    stopNameList: [],
    stopRouteList: [],
    rszLength: null,
    distance: null,
    trackPercent: null,
    reducedSpeed: null,
    averageSpeed: null,
    targetRemoval: null,
    shuttleType: null,
    shuttleStart: null,
    shuttleEnd: null,
    elevatorCode: overrides.elevatorCode ?? null,
    escalatorCode: overrides.escalatorCode ?? null,
    criticality: 0,
    childAlerts: [],
  };
}

function feed(now, routes, accessibility = []) {
  return {
    lastUpdated: iso(now, -1),
    total: routes.length + accessibility.length,
    routes,
    accessibility,
  };
}

function allAlertTypes(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-active-line-2",
      route: "2",
      stopStart: "Broadview",
      stopEnd: "Woodbine",
      stopIDList: ["Broadview", "Chester", "Pape", "Donlands", "Greenwood", "Coxwell", "Woodbine"],
      title: "No service between Broadview and Woodbine stations while we respond to a medical emergency. Shuttle buses are on the way.",
      headerText: "Line 2 Bloor-Danforth: No service between Broadview and Woodbine stations while we respond to a medical emergency. Shuttle buses are on the way.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Medical emergency",
      shuttleType: "Ordered",
      shuttleStart: "Broadview",
      shuttleEnd: "Woodbine",
    }),
    routeAlert(now, {
      id: "scenario-delay-line-4",
      route: "4",
      stopStart: "Sheppard-Yonge",
      stopEnd: "Don Mills",
      title: "Delays eastbound between Sheppard-Yonge and Don Mills while we respond to a signal problem.",
      headerText: "Line 4 Sheppard: Delays eastbound between Sheppard-Yonge and Don Mills while we respond to a signal problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Eastbound",
      cause: "SIGNALS",
      causeDescription: "Signal problem",
    }),
    routeAlert(now, {
      id: "scenario-rsz-line-1-south",
      route: "1",
      stopStart: "Eglinton",
      stopEnd: "Davisville",
      stopIDList: ["Eglinton", "Davisville"],
      title: "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      headerText: "Line 1 Yonge-University: Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "600 metres",
      distance: "900 metres",
      trackPercent: "67%",
      reducedSpeed: "15 km/h",
      averageSpeed: "35 km/h",
      targetRemoval: "Mid-June",
    }),
    routeAlert(now, {
      id: "scenario-planned-line-1-nightly",
      alertType: "Planned",
      route: "1",
      stopStart: "St George",
      stopEnd: "Sheppard West",
      stopIDList: ["St George", "Spadina", "Dupont", "St Clair West", "Cedarvale", "Glencairn", "Lawrence West", "Yorkdale", "Wilson", "Sheppard West"],
      title: "There will be no subway service between St George and Sheppard West stations nightly due to planned track work. Shuttle buses will operate.",
      headerText: "Line 1 Yonge-University: There will be no subway service between St George and Sheppard West stations nightly due to planned track work. Shuttle buses will operate.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      activePeriod: finitePeriod(now, -120, 720),
      activePeriodGroup: ["Current", "Weekend"],
      shuttleType: "Will Operate",
      shuttleStart: "St George",
      shuttleEnd: "Sheppard West",
      childAlerts: [
        { id: "scenario-planned-line-1-window-active", startTime: iso(now, -30), endTime: iso(now, 90) },
        { id: "scenario-planned-line-1-window-future", startTime: iso(now, 360), endTime: iso(now, 480) },
      ],
    }),
  ], [
    accessibilityAlert(now, {
      id: "scenario-elevator-warden",
      routeType: "Elevator",
      title: "Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      headerText: "Warden: Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      elevatorCode: "TEST-E1",
      causeDescription: "Maintenance",
    }),
  ]);
}

function nonlinearUnionCurve(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-rsz-union-king-south",
      route: "1",
      stopStart: "King",
      stopEnd: "Union",
      title: "Subway trains will move slower than usual southbound from King to Union stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual southbound from King to Union stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "250 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
    routeAlert(now, {
      id: "scenario-rsz-union-king-north",
      route: "1",
      stopStart: "Union",
      stopEnd: "King",
      title: "Subway trains will move slower than usual northbound from Union to King stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual northbound from Union to King stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Northbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "250 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
    routeAlert(now, {
      id: "scenario-suspension-st-andrew-union",
      route: "1",
      stopStart: "St Andrew",
      stopEnd: "Union",
      title: "No service between St Andrew and Union stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service between St Andrew and Union stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "St Andrew",
      shuttleEnd: "Union",
    }),
  ]);
}

function nonlinearStGeorgeSpadina(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-rsz-spadina-st-george",
      route: "1",
      stopStart: "Spadina",
      stopEnd: "St George",
      title: "Subway trains will move slower than usual southbound from Spadina to St George stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual southbound from Spadina to St George stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "180 metres",
      reducedSpeed: "15 km/h",
    }),
    routeAlert(now, {
      id: "scenario-delay-dupont-spadina",
      route: "1",
      stopStart: "Dupont",
      stopEnd: "Spadina",
      title: "Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      headerText: "Line 1 Yonge-University: Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Southbound",
      cause: "OPERATIONS",
      causeDescription: "Operational problem",
    }),
  ]);
}

function line5Suspension(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-line-5-avenue-leaside",
      route: "5",
      routeType: "LRT",
      stopStart: "Avenue",
      stopEnd: "Leaside",
      stopIDList: ["Avenue", "Eglinton", "Mount Pleasant", "Leaside"],
      title: "No service between Avenue and Leaside stations due to an emergency alarm. Shuttle buses are on the way.",
      headerText: "Line 5 Eglinton: No service between Avenue and Leaside stations due to an emergency alarm. Shuttle buses are on the way.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "LRT - Emergency alarm",
      shuttleType: "Ordered",
      shuttleStart: "Avenue",
      shuttleEnd: "Leaside",
    }),
  ]);
}

function nightlyClosureActiveWindow(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-nightly-active-line-1",
      alertType: "Planned",
      route: "1",
      stopStart: "St George",
      stopEnd: "Sheppard West",
      stopIDList: ["St George", "Spadina", "Dupont", "St Clair West", "Cedarvale", "Glencairn", "Lawrence West", "Yorkdale", "Wilson", "Sheppard West"],
      title: "There will be no subway service between St George and Sheppard West stations during nightly closure windows for planned track work.",
      headerText: "Line 1 Yonge-University: There will be no subway service between St George and Sheppard West stations during nightly closure windows for planned track work.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      activePeriod: finitePeriod(now, -180, 600),
      activePeriodGroup: ["Current", "Weekend"],
      shuttleType: "Will Operate",
      shuttleStart: "St George",
      shuttleEnd: "Sheppard West",
      childAlerts: [
        { id: "scenario-nightly-window-active", startTime: iso(now, -20), endTime: iso(now, 70) },
        { id: "scenario-nightly-window-next", startTime: iso(now, 240), endTime: iso(now, 330) },
      ],
    }),
  ]);
}

function stationNodeImpact(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-station-node-keele",
      route: "2",
      stopStart: "Keele",
      stopEnd: "Keele",
      stopIDList: ["Keele"],
      title: "Delays westbound at Keele station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays westbound at Keele station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Westbound",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
  ]);
}

export function buildScenarioFeed(name, options = {}) {
  const now = dateFrom(options.now ?? DEFAULT_NOW);
  switch (name) {
    case "all-alert-types":
      return allAlertTypes(now);
    case "nonlinear-union-curve":
      return nonlinearUnionCurve(now);
    case "nonlinear-st-george-spadina":
      return nonlinearStGeorgeSpadina(now);
    case "line-5-suspension":
      return line5Suspension(now);
    case "nightly-closure-active-window":
      return nightlyClosureActiveWindow(now);
    case "station-node-impact":
      return stationNodeImpact(now);
    default:
      throw new Error(`Unknown LineWatch alert scenario: ${name}`);
  }
}
```

- [ ] **Step 2: Add the fixture generator**

Create `scripts/generate-alert-scenarios.mjs`:

```javascript
import { mkdir, writeFile } from "node:fs/promises";
import { buildScenarioFeed, scenarioExpectations, scenarioNames } from "./alert-scenario-catalog.mjs";

const outputDir = new URL("../backend/src/test/resources/fixtures/ttc-alert-scenarios/", import.meta.url);
const fixedNow = "2026-06-03T15:00:00.000Z";

await mkdir(outputDir, { recursive: true });

for (const name of scenarioNames) {
  const feed = buildScenarioFeed(name, { now: fixedNow });
  await writeFile(
    new URL(`${name}.json`, outputDir),
    `${JSON.stringify(feed, null, 2)}\n`,
    "utf8",
  );
}

await writeFile(
  new URL("scenario-index.json", outputDir),
  `${JSON.stringify({ generatedAt: fixedNow, scenarios: scenarioNames.map((name) => ({
    name,
    file: `${name}.json`,
    ...scenarioExpectations[name],
  })) }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${scenarioNames.length} LineWatch alert scenarios to ${outputDir.pathname}`);
```

- [ ] **Step 3: Run the generator**

Run:

```bash
node scripts/generate-alert-scenarios.mjs
find backend/src/test/resources/fixtures/ttc-alert-scenarios -maxdepth 1 -type f | sort
```

Expected:

```text
backend/src/test/resources/fixtures/ttc-alert-scenarios/all-alert-types.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/line-5-suspension.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/nightly-closure-active-window.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/nonlinear-st-george-spadina.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/nonlinear-union-curve.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/scenario-index.json
backend/src/test/resources/fixtures/ttc-alert-scenarios/station-node-impact.json
```

- [ ] **Step 4: Inspect generated fixture shape**

Run:

```bash
jq '.routes | length' backend/src/test/resources/fixtures/ttc-alert-scenarios/all-alert-types.json
jq '.accessibility | length' backend/src/test/resources/fixtures/ttc-alert-scenarios/all-alert-types.json
jq '.scenarios[].name' backend/src/test/resources/fixtures/ttc-alert-scenarios/scenario-index.json
```

Expected: `4`, `1`, and all six scenario names.

- [ ] **Step 5: Commit the catalog source and generated fixtures**

Run:

```bash
git add scripts/alert-scenario-catalog.mjs scripts/generate-alert-scenarios.mjs backend/src/test/resources/fixtures/ttc-alert-scenarios
git commit -m "test: add TTC alert scenario fixtures"
```

Expected: one commit containing only scenario fixture source and generated JSON.

## Task 2: Add Backend Scenario Catalog Tests

**Files:**
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java`

- [ ] **Step 1: Write the failing test**

Create `TtcAlertScenarioCatalogTest.java`:

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.client.RestClient;

class TtcAlertScenarioCatalogTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final TtcAlertNormalizer normalizer;
    private final TtcAlertClient client;

    TtcAlertScenarioCatalogTest() {
        when(stationRepository.existsById(anyString())).thenReturn(true);
        normalizer = new TtcAlertNormalizer(
            new StationAliasResolver(stationRepository),
            new AlertDirectionParser()
        );
        client = new TtcAlertClient(
            RestClient.create(),
            new ObjectMapper().findAndRegisterModules(),
            new AlertIngestionProperties()
        );
    }

    static Stream<Arguments> scenarios() {
        return Stream.of(
            Arguments.of("all-alert-types.json", 4, 1, EnumSet.of(
                AlertImpactKind.SUSPENSION,
                AlertImpactKind.DELAY,
                AlertImpactKind.REDUCED_SPEED_ZONE,
                AlertImpactKind.PLANNED_CLOSURE
            )),
            Arguments.of("nonlinear-union-curve.json", 3, 0, EnumSet.of(
                AlertImpactKind.SUSPENSION,
                AlertImpactKind.REDUCED_SPEED_ZONE
            )),
            Arguments.of("nonlinear-st-george-spadina.json", 2, 0, EnumSet.of(
                AlertImpactKind.DELAY,
                AlertImpactKind.REDUCED_SPEED_ZONE
            )),
            Arguments.of("line-5-suspension.json", 1, 0, EnumSet.of(
                AlertImpactKind.SUSPENSION
            )),
            Arguments.of("nightly-closure-active-window.json", 1, 0, EnumSet.of(
                AlertImpactKind.PLANNED_CLOSURE
            )),
            Arguments.of("station-node-impact.json", 1, 0, EnumSet.of(
                AlertImpactKind.DELAY
            ))
        );
    }

    @ParameterizedTest
    @MethodSource("scenarios")
    void scenarioFeedsParseAndNormalizeWithoutUnmatchedRapidTransitRecords(
        String fileName,
        int routeCount,
        int accessibilityCount,
        Set<AlertImpactKind> expectedImpactKinds
    ) throws Exception {
        TtcAlertFeed feed = parseScenario(fileName);

        assertThat(feed.routes()).hasSize(routeCount);
        assertThat(feed.accessibility()).hasSize(accessibilityCount);

        List<NormalizedRouteAlert> routeAlerts = feed.routes().stream()
            .map(normalizer::normalizeRoute)
            .peek(result -> assertThat(result.status())
                .describedAs("%s route normalization status", fileName)
                .isEqualTo(NormalizationStatus.MATCHED))
            .map(result -> result.projection().orElseThrow())
            .toList();

        assertThat(routeAlerts)
            .extracting(NormalizedRouteAlert::impactKind)
            .containsAll(expectedImpactKinds);

        for (TtcFetchedRecord accessibility : feed.accessibility()) {
            assertThat(normalizer.normalizeAccessibility(accessibility).status())
                .describedAs("%s accessibility normalization status", fileName)
                .isEqualTo(NormalizationStatus.MATCHED);
        }
    }

    private TtcAlertFeed parseScenario(String fileName) throws Exception {
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-alert-scenarios/" + fileName).readAllBytes(),
            StandardCharsets.UTF_8
        );
        return client.parse(body);
    }
}
```

- [ ] **Step 2: Run the new test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertScenarioCatalogTest test
```

Expected: PASS. If it fails, fix the scenario catalog or station names; do not loosen the test to allow unmatched rapid-transit records.

- [ ] **Step 3: Run related ingestion tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertClientTest,TtcAlertNormalizerTest,TtcAlertScenarioCatalogTest test
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java
git commit -m "test: verify alert scenario catalog normalization"
```

Expected: one backend-test commit.

## Task 3: Add Scenario Feed Server And Backend Dev Script

**Files:**
- Create: `scripts/mock-alerts-server.mjs`
- Create: `scripts/dev-alert-scenario.sh`
- Modify: `scripts/mock-alerts-server.js`

- [ ] **Step 1: Create the dynamic scenario feed server**

Create `scripts/mock-alerts-server.mjs`:

```javascript
#!/usr/bin/env node
import { createServer } from "node:http";
import { buildScenarioFeed, scenarioNames } from "./alert-scenario-catalog.mjs";

const port = Number(process.env.LINEWATCH_ALERT_SCENARIO_PORT ?? "8081");
const scenario = process.env.LINEWATCH_ALERT_SCENARIO ?? process.argv[2] ?? "all-alert-types";

if (!scenarioNames.includes(scenario)) {
  console.error(`Unknown scenario: ${scenario}`);
  console.error(`Available scenarios: ${scenarioNames.join(", ")}`);
  process.exit(2);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body, null, 2));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "GET" && url.pathname === "/__scenarios") {
    sendJson(response, 200, { active: scenario, scenarios: scenarioNames });
    return;
  }

  if (request.method === "GET" && url.pathname === "/live-alerts") {
    sendJson(response, 200, buildScenarioFeed(scenario, { now: new Date() }));
    return;
  }

  sendJson(response, 404, { error: "Unknown mock TTC alert route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LineWatch alert scenario server listening on http://127.0.0.1:${port}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Feed: http://127.0.0.1:${port}/live-alerts`);
});
```

- [ ] **Step 2: Replace the old prototype with a compatibility wrapper**

Replace `scripts/mock-alerts-server.js` with CommonJS wrapper code:

```javascript
#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { join } = require("node:path");

const child = spawn(
  process.execPath,
  [join(__dirname, "mock-alerts-server.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
```

- [ ] **Step 3: Create the backend scenario dev script**

Create `scripts/dev-alert-scenario.sh`:

```sh
#!/usr/bin/env sh
set -eu

SCENARIO="${1:-all-alert-types}"
PORT="${LINEWATCH_ALERT_SCENARIO_PORT:-8081}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

node "$REPO_ROOT/scripts/mock-alerts-server.mjs" "$SCENARIO" &
SERVER_PID="$!"

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

LINEWATCH_INGESTION_ALERTS_URL="http://127.0.0.1:$PORT/live-alerts" \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY="${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:-PT10S}" \
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE="${LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE:-PT10M}" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
```

- [ ] **Step 4: Make scripts executable**

Run:

```bash
chmod +x scripts/mock-alerts-server.mjs scripts/dev-alert-scenario.sh
```

Expected: no output.

- [ ] **Step 5: Test the server directly**

Run:

```bash
node scripts/mock-alerts-server.mjs nonlinear-union-curve &
SERVER_PID=$!
sleep 1
curl -s http://127.0.0.1:8081/__scenarios | jq .
curl -s http://127.0.0.1:8081/live-alerts | jq '{routes: (.routes | length), accessibility: (.accessibility | length), ids: [.routes[].id]}'
kill "$SERVER_PID"
```

Expected: the active scenario is `nonlinear-union-curve`, routes count is `3`, accessibility count is `0`, and route IDs include `scenario-rsz-union-king-south`.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/mock-alerts-server.mjs scripts/mock-alerts-server.js scripts/dev-alert-scenario.sh
git commit -m "test: add local alert scenario server"
```

Expected: one scripts-only commit.

## Task 4: Add Backend Map Guide Impact Regression

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`

- [ ] **Step 1: Add failing test for nonlinear guide metadata with impacts**

Append this test to `MapControllerTest`:

```java
@Test
void exposesNonlinearGuideMetadataWithActiveImpacts() {
    when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
    when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
        new LineSegmentEntity(
            "line-1-king-union",
            "line-1",
            "king",
            "union",
            null,
            null,
            216,
            "southbound",
            "seg-line-1-union-king",
            false,
            null,
            null
        ),
        new LineSegmentEntity(
            "line-1-spadina-st-george",
            "line-1",
            "spadina",
            "st-george",
            null,
            null,
            115,
            "southbound",
            "seg-line-1-spadina-st-george",
            true,
            "station-spadina-1",
            null
        )
    ));
    when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
        "line-1-king-union",
        List.of(new AlertDashboardService.SegmentImpact(
            "reduced-speed-zone",
            "reduced-speed-zone-ttc-route-scenario-rsz-union-king-south",
            "bidirectional",
            List.of(
                "ttc-route-scenario-rsz-union-king-north",
                "ttc-route-scenario-rsz-union-king-south"
            )
        )),
        "line-1-spadina-st-george",
        List.of(new AlertDashboardService.SegmentImpact(
            "delay",
            "ttc-route-scenario-delay-spadina-st-george",
            "forward",
            List.of("ttc-route-scenario-delay-spadina-st-george")
        ))
    ));
    when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

    MapController.MapResponse response = controller.getMap();

    assertThat(response.segments()).hasSize(2);
    assertThat(response.segments().get(0)).satisfies(segment -> {
        assertThat(segment.id()).isEqualTo("line-1-king-union");
        assertThat(segment.guidePathId()).isEqualTo("seg-line-1-union-king");
        assertThat(segment.guidePathReversed()).isFalse();
        assertThat(segment.overlay()).isEqualTo("delay");
        assertThat(segment.reducedSpeedZoneIds())
            .containsExactly("reduced-speed-zone-ttc-route-scenario-rsz-union-king-south");
    });
    assertThat(response.segments().get(1)).satisfies(segment -> {
        assertThat(segment.id()).isEqualTo("line-1-spadina-st-george");
        assertThat(segment.guidePathId()).isEqualTo("seg-line-1-spadina-st-george");
        assertThat(segment.guidePathReversed()).isTrue();
        assertThat(segment.impacts()).singleElement().satisfies(impact -> {
            assertThat(impact.kind()).isEqualTo("delay");
            assertThat(impact.travelDirection()).isEqualTo("forward");
        });
    });
}
```

- [ ] **Step 2: Run the map test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=MapControllerTest test
```

Expected: PASS. If it fails because imports are missing, add the missing `java.util.List` or `java.util.Map` imports already used by the class.

- [ ] **Step 3: Commit**

Run:

```bash
git add backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java
git commit -m "test: cover nonlinear map impacts"
```

Expected: one backend-test commit.

## Task 5: Add Frontend Scenario Catalog And Nonlinear Smoke Tests

**Files:**
- Create: `frontend/tests/alert-scenario-catalog.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add fixture catalog and SVG-guide consistency test**

Create `frontend/tests/alert-scenario-catalog.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioRoot = new URL("../../backend/src/test/resources/fixtures/ttc-alert-scenarios/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("scenario-index.json", scenarioRoot), "utf8"));
const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-edited.svg", import.meta.url),
  "utf8",
);

describe("alert scenario catalog", () => {
  it("contains TTC Live Alerts feed envelopes for every indexed scenario", () => {
    assert.equal(index.scenarios.length, 6);
    for (const scenario of index.scenarios) {
      const feed = JSON.parse(readFileSync(new URL(scenario.file, scenarioRoot), "utf8"));
      assert.ok(Array.isArray(feed.routes), `${scenario.name} routes array`);
      assert.ok(Array.isArray(feed.accessibility), `${scenario.name} accessibility array`);
      assert.equal(feed.routes.length, scenario.routeCount, `${scenario.name} route count`);
      assert.equal(feed.accessibility.length, scenario.accessibilityCount, `${scenario.name} accessibility count`);
    }
  });

  it("references nonlinear guide paths that exist in the edited TTC SVG", () => {
    const guideIds = index.scenarios.flatMap((scenario) => scenario.guidePathIds);
    assert.deepEqual(
      [...new Set(guideIds)].sort(),
      [
        "seg-line-1-dupont-spadina",
        "seg-line-1-spadina-st-george",
        "seg-line-1-st-andrew-union",
        "seg-line-1-union-king",
      ],
    );

    for (const guideId of guideIds) {
      assert.match(svg, new RegExp(`inkscape:label="${guideId}"`));
    }
  });
});
```

- [ ] **Step 2: Add nonlinear stub data**

In `frontend/tests/smoke/api-stub-data.mjs`, add these stations to `mapResponse.stations`:

```javascript
{ id: "stub-king", name: "King", x: 4547, y: 3362, interchange: false },
{ id: "stub-union", name: "Union", x: 4311, y: 3597, interchange: true },
{ id: "stub-spadina-line-1", name: "Spadina", x: 3632, y: 2604, interchange: true },
{ id: "stub-st-george", name: "St George", x: 4010, y: 2604, interchange: true },
```

Add these segments to `mapResponse.segments`:

```javascript
{
  id: "stub-line-1-king-union",
  lineId: "line-1",
  label: "King to Union",
  stationAId: "stub-king",
  stationBId: "stub-union",
  guidePathId: "seg-line-1-union-king",
  guidePathReversed: false,
  pathD: "",
  impacts: [
    {
      kind: "reduced-speed-zone",
      cardId: "reduced-speed-zone-stub-union-curve",
      travelDirection: "bidirectional",
      sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
    },
  ],
  overlay: "delay",
  travelDirection: "bidirectional",
  sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
  reducedSpeedZoneIds: ["reduced-speed-zone-stub-union-curve"],
  alertId: null,
},
{
  id: "stub-line-1-spadina-st-george",
  lineId: "line-1",
  label: "Spadina to St George",
  stationAId: "stub-spadina-line-1",
  stationBId: "stub-st-george",
  guidePathId: "seg-line-1-spadina-st-george",
  guidePathReversed: true,
  pathD: "",
  impacts: [
    {
      kind: "delay",
      cardId: "stub-delay-st-george-curve",
      travelDirection: "forward",
      sourceAlertIds: ["stub-delay-st-george-curve"],
    },
  ],
  overlay: "delay",
  travelDirection: "forward",
  sourceAlertIds: ["stub-delay-st-george-curve"],
  alertId: "stub-delay-st-george-curve",
},
```

Add this object to `reducedSpeedZonesResponse`:

```javascript
{
  id: "reduced-speed-zone-stub-union-curve",
  lineId: "line-1",
  lineNumber: "1",
  title: "Reduced Speed Zone",
  location: "King <-> Union",
  displayDirection: "Northbound & Southbound",
  description: "Scenario RSZ across the Union curve.",
  startedAt: "2026-06-03T09:00:00-04:00",
  updatedAt: "2026-06-03T10:00:00-04:00",
  cause: "Track issue",
  resolution: "This week",
  rszLength: "250 metres",
  reducedSpeed: "15 km/h",
  affectedSegmentIds: ["stub-line-1-king-union"],
  sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
  directionalDetails: [
    {
      sourceAlertId: "stub-union-curve-south",
      displayDirection: "Southbound",
      location: "King to Union",
      description: "Southbound trains are moving slower than usual.",
    },
    {
      sourceAlertId: "stub-union-curve-north",
      displayDirection: "Northbound",
      location: "Union to King",
      description: "Northbound trains are moving slower than usual.",
    },
  ],
  source: "Playwright API stub",
},
```

Add this object to `delaysResponse`:

```javascript
{
  id: "stub-delay-st-george-curve",
  lineId: "line-1",
  lineNumber: "1",
  title: "Delay from Spadina to St George",
  location: "Spadina to St George",
  description: "Scenario delay on the St George curve.",
  affectedSegmentIds: ["stub-line-1-spadina-st-george"],
  startedAt: "2026-06-03T09:15:00-04:00",
  updatedAt: "2026-06-03T09:30:00-04:00",
  source: "Playwright API stub",
  cause: "Operational issue",
},
```

- [ ] **Step 3: Add nonlinear overlay smoke test**

Append this test to `frontend/tests/smoke/dashboard.spec.ts`:

```typescript
test("nonlinear guide-backed overlays open their corresponding cards", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "reduced-speed-zone: King to Union" }).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  const unionCurveCard = page.locator('[data-impact-card-id="reduced-speed-zone-stub-union-curve"]');
  await expect(unionCurveCard).toBeVisible();
  await expect(unionCurveCard).toHaveClass(/highlight-active-card/);
  await expect(unionCurveCard.getByText("King <-> Union")).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "delay: Spadina to St George" }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const stGeorgeCurveCard = page.locator('[data-impact-card-id="stub-delay-st-george-curve"]');
  await expect(stGeorgeCurveCard).toBeVisible();
  await expect(stGeorgeCurveCard).toHaveClass(/highlight-active-card/);
});
```

- [ ] **Step 4: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS, including the new `alert-scenario-catalog.test.mjs`.

- [ ] **Step 5: Run smoke tests if Chromium is installed**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If Chromium is missing, run `npm --prefix frontend run test:smoke:install` only with user approval if network access is required, then retry.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/tests/alert-scenario-catalog.test.mjs frontend/tests/smoke/api-stub-data.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover nonlinear alert scenario overlays"
```

Expected: one frontend-test commit.

## Task 6: Document Scenario Harness Usage

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Add README section**

Add a section near the live backend setup docs:

````markdown
### Alert Scenario Harness

The repository includes dev/test TTC Live Alerts scenario feeds under
`backend/src/test/resources/fixtures/ttc-alert-scenarios/`. These fixtures are
TTC-shaped examples for LineWatch testing only; synthetic records are used where
captured public examples are not available.

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

Run the backend against a scenario:

```bash
scripts/dev-alert-scenario.sh all-alert-types
```

Then open the normal frontend and inspect `/api/alerts`, `/api/map`, alert cards,
station rings, and nonlinear overlays. The scenario harness does not make the app
an official TTC product and does not represent a live feed.
````

- [ ] **Step 2: Add agent guidance**

Add matching bullets to both `AGENTS.md` and `GEMINI.md`:

```markdown
- `backend/src/test/resources/fixtures/ttc-alert-scenarios/` contains generated TTC-shaped alert scenario feeds for dev/test coverage.
- `scripts/alert-scenario-catalog.mjs` is the source of truth for those generated fixtures; run `node scripts/generate-alert-scenarios.mjs` after editing it.
- `scripts/dev-alert-scenario.sh <scenario-name>` runs the backend against a local scenario feed for manual browser testing.
- Scenario records may be synthetic when captured public TTC samples are unavailable; do not describe scenario data as live TTC service.
```

- [ ] **Step 3: Run docs diff check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document alert scenario harness"
```

Expected: one docs commit.

## Task 7: Full Verification

**Files:**
- Verify: backend, frontend, scripts, docs

- [ ] **Step 1: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend static checks**

Run:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run frontend smoke tests for substantial UI-map change**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If local Chromium is missing or Playwright cannot install because of network restrictions, report the exact command and failure.

- [ ] **Step 5: Manually verify one backend scenario**

Start infrastructure if it is not running:

```bash
docker compose up -d postgres redis
```

Start backend scenario mode:

```bash
scripts/dev-alert-scenario.sh nonlinear-union-curve
```

In another terminal, after the first poll succeeds:

```bash
curl -s http://localhost:8080/api/health/ingestion | jq .
curl -s http://localhost:8080/api/alerts?type=slowdown | jq '.[].location'
curl -s http://localhost:8080/api/map | jq '.segments[] | select(.guidePathId != null and (.impacts | length > 0)) | {id, guidePathId, impacts}'
```

Expected: ingestion health reports a fresh success, the slowdown response includes the Union curve scenario, and `/api/map` contains guide-backed impacted segments.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: only intentional changes remain. If verification generated `test-results/`, leave it untracked unless the repo already tracks it.

## Success Criteria

- `node scripts/generate-alert-scenarios.mjs` deterministically writes the scenario JSON catalog.
- `mvn -f backend/pom.xml -Dtest=TtcAlertScenarioCatalogTest test` proves every scenario parses and normalizes without unmatched rapid-transit records.
- `scripts/dev-alert-scenario.sh all-alert-types` can run the backend against local scenario data.
- Nonlinear Union and St George/Spadina guide IDs are covered by backend DTO tests and frontend fixture tests.
- Playwright can click a nonlinear RSZ overlay and land on the corresponding card.
- README, AGENTS.md, and GEMINI.md explain that scenario data is dev/test data and may be synthetic.

## Known Risks

- Current worktree may contain unrelated in-progress edits. Preserve them and avoid broad staging.
- The existing `scripts/mock-alerts-server.js` prototype uses ESM syntax in a `.js` file without a root `package.json`; replacing it with a CommonJS wrapper avoids that runtime issue.
- Playwright smoke tests may require Chromium installation. Treat missing browser binaries as an environment issue, not a product failure.
- Scenario records are TTC-shaped but not all captured from TTC. Documentation must keep that distinction visible.
