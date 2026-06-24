# Traffic Spike Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce LineWatchTO origin load during Reddit-style traffic spikes while keeping the app on the current zero-cost Oracle VPS and Cloudflare Free where possible.

**Architecture:** Make public dashboard reads cache-friendly and cheaper before adding infrastructure. The implementation adds a single backend `/api/dashboard` public aggregate endpoint, changes frontend initial/refresh reads to prefer that one payload, slows visible-client polling, adds Caddy cache-control headers for public versus private routes, and documents Cloudflare Cache Rules plus production verification. Account, auth, feedback, push, and health endpoints must remain uncached.

**Tech Stack:** Java 21, Spring Boot, Redis-backed dashboard cache, Next.js App Router, React, TypeScript, Caddy, Docker Compose, Cloudflare Free Cache Rules, Node built-in tests, Maven tests.

---

## Execution Notes For Gemini

- Read `AGENTS.md`, `GEMINI.md`, `README.md`, and this plan before editing.
- Run `git status --short` before each task. The repository may contain unrelated user changes. Do not revert unrelated changes.
- Use `rg` / `rg --files` for search.
- Commit after each completed task if the user wants commits. If not, keep changes staged/unstaged as requested by the user.
- Do not cache user-specific or write endpoints.
- Do not claim the dashboard is live unless fresh ingestion exists.
- If a command fails because of local missing services or sandbox/network restrictions, record the exact command and failure in the final handoff.

---

## File Structure

Create:

- `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardResponses.java`
  - DTO records for the public aggregate dashboard payload.
- `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardController.java`
  - Public `/api/dashboard` endpoint backed by Redis dashboard caching.
- `backend/src/test/java/com/calebhabesh/linewatch/dashboard/DashboardControllerTest.java`
  - Unit coverage for aggregate payload and cache usage.
- `frontend/tests/dashboard-data.test.mjs`
  - Source/behavior guardrails for one-shot dashboard loading, fallback behavior, and refresh defaults.
- `frontend/tests/caddy-cache-headers.test.mjs`
  - Source guardrails for public/private cache headers in Caddy files.
- `docs/traffic-spike-runbook.md`
  - Operator runbook for Cloudflare Free setup, cache rules, verification, surge mode, and rollback.

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`
  - Add `fullDashboardTtl`.
- `backend/src/main/resources/application.yml`
  - Add `LINEWATCH_CACHE_DASHBOARD_FULL_TTL`.
- `frontend/src/app/dashboard-data.ts`
  - Prefer `/api/dashboard`; retain legacy fan-out fallback; retain fixture fallback.
- `frontend/src/components/LineWatchShell.tsx`
  - Change dashboard refresh default/minimum to lower spike pressure.
- `frontend/Dockerfile`
  - Add build arg/env for `NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS`.
- `scripts/prod-build-push.sh`
  - Pass optional dashboard refresh build arg.
- `Caddyfile`
  - Add public short cache headers and private no-store headers.
- `Caddyfile.staging`
  - Mirror production cache headers for staging validation.
- `README.md`
  - Link the traffic spike runbook and mention the current zero-cost spike-mitigation strategy without overclaiming tested capacity.

---

## Task 1: Backend Aggregate Dashboard Endpoint

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardController.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/dashboard/DashboardControllerTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`
- Modify: `backend/src/main/resources/application.yml`

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/calebhabesh/linewatch/dashboard/DashboardControllerTest.java`:

```java
package com.calebhabesh.linewatch.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusController;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DashboardControllerTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T12:00:00Z"), ZoneOffset.UTC);

    private final MapController mapController = mock(MapController.class);
    private final StatusController statusController = mock(StatusController.class);
    private final AlertDashboardService alertDashboardService = mock(AlertDashboardService.class);
    private final PerformanceController performanceController = mock(PerformanceController.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final IngestionFreshness ingestionFreshness = new IngestionFreshness(
        ingestionRunStore,
        new AlertIngestionProperties(),
        CLOCK
    );
    private final DashboardController controller = new DashboardController(
        mapController,
        statusController,
        alertDashboardService,
        performanceController,
        cache,
        cacheProperties,
        ingestionFreshness,
        ingestionRunStore
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void returnsCombinedPublicDashboardPayload() {
        MapController.MapResponse map = new MapController.MapResponse(List.of(), List.of(), List.of());
        StatusController.StatusResponse status = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "2 minutes ago"),
            List.of()
        );
        TtcPerformanceResponses.SnapshotResponse performance = new TtcPerformanceResponses.SnapshotResponse(
            "disabled",
            "TTC.ca",
            "https://www.ttc.ca/",
            "On-time performance",
            "Disabled",
            null,
            false,
            "Performance metrics disabled.",
            List.of()
        );

        when(mapController.getMap()).thenReturn(map);
        when(statusController.getStatus()).thenReturn(status);
        when(alertDashboardService.activeAlerts()).thenReturn(List.of());
        when(alertDashboardService.delays()).thenReturn(List.of());
        when(alertDashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(alertDashboardService.plannedClosures()).thenReturn(List.of());
        when(performanceController.performance()).thenReturn(performance);

        DashboardResponses.DashboardResponse response = controller.dashboard();

        assertThat(response.map()).isSameAs(map);
        assertThat(response.status()).isSameAs(status);
        assertThat(response.activeAlerts()).isEmpty();
        assertThat(response.delays()).isEmpty();
        assertThat(response.reducedSpeedZones()).isEmpty();
        assertThat(response.plannedClosures()).isEmpty();
        assertThat(response.performance()).isSameAs(performance);
    }

    @Test
    void cachesAggregatePayloadWithFreshnessBoundedTtl() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:59:30Z");
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L,
            "success",
            started,
            started.plusSeconds(1),
            10,
            10,
            5,
            0,
            started,
            null
        )));
        when(mapController.getMap()).thenReturn(new MapController.MapResponse(List.of(), List.of(), List.of()));
        when(statusController.getStatus()).thenReturn(new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "30 seconds ago"),
            List.of()
        ));
        when(performanceController.performance()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "disabled",
            "TTC.ca",
            "https://www.ttc.ca/",
            "On-time performance",
            "Disabled",
            null,
            false,
            "Performance metrics disabled.",
            List.of()
        ));

        controller.dashboard();

        verify(cache).getOrCompute(
            org.mockito.ArgumentMatchers.eq("dashboard:full"),
            any(),
            org.mockito.ArgumentMatchers.eq(Duration.ofSeconds(30)),
            any()
        );
    }
}
```

- [ ] **Step 2: Run the new backend test and confirm it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=DashboardControllerTest test
```

Expected: FAIL because `DashboardController`, `DashboardResponses`, and `fullDashboardTtl` do not exist.

- [ ] **Step 3: Add the dashboard response DTO**

Create `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardResponses.java`:

```java
package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusController;
import java.util.List;

public final class DashboardResponses {
    private DashboardResponses() {}

    public record DashboardResponse(
        MapController.MapResponse map,
        StatusController.StatusResponse status,
        List<AlertDashboardService.ActiveAlertDto> activeAlerts,
        List<AlertDashboardService.DelayAlertDto> delays,
        List<AlertDashboardService.ReducedSpeedZoneDto> reducedSpeedZones,
        List<AlertDashboardService.PlannedClosureDto> plannedClosures,
        TtcPerformanceResponses.SnapshotResponse performance
    ) {}
}
```

- [ ] **Step 4: Add `fullDashboardTtl` cache property**

Modify `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`:

```java
package com.calebhabesh.linewatch.cache;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.cache.dashboard")
public class DashboardCacheProperties {
    private boolean enabled = true;
    private Duration fullDashboardTtl = Duration.ofSeconds(30);
    private Duration statusTtl = Duration.ofSeconds(30);
    private Duration mapTtl = Duration.ofSeconds(30);
    private Duration alertsTtl = Duration.ofSeconds(30);
    private Duration ingestionHealthTtl = Duration.ofSeconds(15);
    private Duration performanceTtl = Duration.ofHours(6);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getFullDashboardTtl() { return fullDashboardTtl; }
    public void setFullDashboardTtl(Duration fullDashboardTtl) { this.fullDashboardTtl = fullDashboardTtl; }
    public Duration getStatusTtl() { return statusTtl; }
    public void setStatusTtl(Duration statusTtl) { this.statusTtl = statusTtl; }
    public Duration getMapTtl() { return mapTtl; }
    public void setMapTtl(Duration mapTtl) { this.mapTtl = mapTtl; }
    public Duration getAlertsTtl() { return alertsTtl; }
    public void setAlertsTtl(Duration alertsTtl) { this.alertsTtl = alertsTtl; }
    public Duration getIngestionHealthTtl() { return ingestionHealthTtl; }
    public void setIngestionHealthTtl(Duration ingestionHealthTtl) { this.ingestionHealthTtl = ingestionHealthTtl; }
    public Duration getPerformanceTtl() { return performanceTtl; }
    public void setPerformanceTtl(Duration performanceTtl) { this.performanceTtl = performanceTtl; }
}
```

- [ ] **Step 5: Add the property to Spring config**

Modify `backend/src/main/resources/application.yml` under `linewatch.cache.dashboard`:

```yaml
      full-dashboard-ttl: ${LINEWATCH_CACHE_DASHBOARD_FULL_TTL:PT30S}
      status-ttl: ${LINEWATCH_CACHE_DASHBOARD_STATUS_TTL:PT30S}
      map-ttl: ${LINEWATCH_CACHE_DASHBOARD_MAP_TTL:PT30S}
      alerts-ttl: ${LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL:PT30S}
      ingestion-health-ttl: ${LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL:PT15S}
      performance-ttl: ${LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL:PT6H}
```

- [ ] **Step 6: Add the dashboard controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardController.java`:

```java
package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.status.StatusController;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final MapController mapController;
    private final StatusController statusController;
    private final AlertDashboardService alertDashboardService;
    private final PerformanceController performanceController;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final IngestionFreshness ingestionFreshness;
    private final IngestionRunStore ingestionRunStore;

    public DashboardController(
        MapController mapController,
        StatusController statusController,
        AlertDashboardService alertDashboardService,
        PerformanceController performanceController,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this.mapController = mapController;
        this.statusController = statusController;
        this.alertDashboardService = alertDashboardService;
        this.performanceController = performanceController;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.ingestionFreshness = ingestionFreshness;
        this.ingestionRunStore = ingestionRunStore;
    }

    @GetMapping
    public DashboardResponses.DashboardResponse dashboard() {
        Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatest())
            .map(remaining -> remaining.compareTo(cacheProperties.getFullDashboardTtl()) < 0
                ? remaining
                : cacheProperties.getFullDashboardTtl())
            .orElse(cacheProperties.getFullDashboardTtl());

        return cache.getOrCompute(
            "dashboard:full",
            new TypeReference<DashboardResponses.DashboardResponse>() {},
            ttl,
            this::buildDashboard
        );
    }

    private DashboardResponses.DashboardResponse buildDashboard() {
        return new DashboardResponses.DashboardResponse(
            mapController.getMap(),
            statusController.getStatus(),
            alertDashboardService.activeAlerts(),
            alertDashboardService.delays(),
            alertDashboardService.reducedSpeedZones(),
            alertDashboardService.plannedClosures(),
            performanceController.performance()
        );
    }
}
```

- [ ] **Step 7: Run the backend dashboard test and confirm it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=DashboardControllerTest test
```

Expected: PASS.

- [ ] **Step 8: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS. If unrelated dirty work causes failures, record the exact failing test and inspect before changing files outside this task.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardResponses.java \
  backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardController.java \
  backend/src/test/java/com/calebhabesh/linewatch/dashboard/DashboardControllerTest.java \
  backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java \
  backend/src/main/resources/application.yml
git commit -m "feat: add cached public dashboard endpoint"
```

---

## Task 2: Frontend Uses Single Dashboard Payload With Legacy Fallback

**Files:**

- Create: `frontend/tests/dashboard-data.test.mjs`
- Modify: `frontend/src/app/dashboard-data.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/Dockerfile`
- Modify: `scripts/prod-build-push.sh`

- [ ] **Step 1: Write source guardrail tests**

Create `frontend/tests/dashboard-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const dockerfileSource = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const prodBuildPushSource = readFileSync(new URL("../../scripts/prod-build-push.sh", import.meta.url), "utf8");

describe("dashboard spike mitigation", () => {
  it("prefers the single aggregate dashboard endpoint before legacy fan-out", () => {
    assert.match(dashboardDataSource, /fetchSafe<DashboardApiResponse>\("\/api\/dashboard"\)/);
    assert.match(dashboardDataSource, /loadDashboardFromAggregate/);
    assert.match(dashboardDataSource, /loadDashboardFromLegacyEndpoints/);
  });

  it("keeps fixture fallback when backend dashboard data is unavailable", () => {
    assert.match(dashboardDataSource, /dataSource: useFallback \? "fallback" : "backend"/);
    assert.match(dashboardDataSource, /fallbackSegments/);
    assert.match(dashboardDataSource, /fallbackPerformance/);
  });

  it("uses a slower default dashboard refresh for production spike tolerance", () => {
    assert.match(shellSource, /const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;/);
    assert.match(shellSource, /const MIN_DASHBOARD_REFRESH_MS = 10_000;/);
  });

  it("passes dashboard refresh interval as an optional build-time value", () => {
    assert.match(dockerfileSource, /ARG NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS/);
    assert.match(dockerfileSource, /ENV NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=\$\{NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS\}/);
    assert.match(prodBuildPushSource, /NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS/);
  });
});
```

- [ ] **Step 2: Run the new frontend test and confirm it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- dashboard-data.test.mjs
```

Expected: FAIL because the aggregate endpoint path and build arg do not exist yet. If the script ignores the extra argument, run `node --test frontend/tests/dashboard-data.test.mjs`.

- [ ] **Step 3: Refactor `dashboard-data.ts` to prefer `/api/dashboard`**

Modify `frontend/src/app/dashboard-data.ts` so the complete file has this structure:

```ts
import {
  networkSegments as fallbackSegments,
  stations as fallbackStations,
  lineStatuses as fallbackStatuses,
  activeAlerts as fallbackAlerts,
  delays as fallbackDelays,
  reducedSpeedZones as fallbackReducedSpeedZones,
  plannedClosures as fallbackClosures,
  stationNodeImpacts as fallbackStationNodeImpacts,
  generatedAt as fallbackGeneratedAt,
  ingestionHealth,
  commuteImpacts,
  reliabilitySummaries,
  mapAsset,
  ttcPerformanceSnapshot as fallbackPerformance,
  type TtcPerformanceSnapshot,
  type ReducedSpeedZone,
  type ActiveAlert,
  type DelayAlert,
  type LineStatus,
  type NetworkSegment,
  type PlannedClosure,
  type Station,
  type StationNodeImpact
} from "./linewatch-data";
import type { DashboardData } from "./DataContext";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type MapApiResponse = {
  stations: Station[];
  segments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
};

type StatusApiResponse = {
  generatedAt: typeof fallbackGeneratedAt;
  lines: LineStatus[];
};

type DashboardApiResponse = {
  map: MapApiResponse;
  status: StatusApiResponse;
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  performance: TtcPerformanceSnapshot;
};

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function fromBackendPayload(payload: DashboardApiResponse): DashboardData {
  return {
    dataSource: "backend",
    networkSegments: payload.map.segments,
    stations: payload.map.stations,
    lineStatuses: payload.status.lines,
    generatedAt: payload.status.generatedAt,
    activeAlerts: payload.activeAlerts,
    delays: payload.delays,
    reducedSpeedZones: payload.reducedSpeedZones,
    plannedClosures: payload.plannedClosures,
    stationNodeImpacts: payload.map.stationNodeImpacts,
    commuteImpacts,
    reliabilitySummaries,
    ttcPerformance: payload.performance ?? fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
}

function fallbackDashboardData(): DashboardData {
  return {
    dataSource: "fallback",
    networkSegments: fallbackSegments,
    stations: fallbackStations,
    lineStatuses: fallbackStatuses,
    generatedAt: {
      ...fallbackGeneratedAt,
      lastPoll: "fixture mode",
      live: false,
    },
    activeAlerts: fallbackAlerts,
    delays: fallbackDelays,
    reducedSpeedZones: fallbackReducedSpeedZones,
    plannedClosures: fallbackClosures,
    stationNodeImpacts: fallbackStationNodeImpacts,
    commuteImpacts,
    reliabilitySummaries,
    ttcPerformance: fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
}

async function loadDashboardFromAggregate(): Promise<DashboardData | null> {
  const payload = await fetchSafe<DashboardApiResponse>("/api/dashboard");
  if (!payload?.map || !payload.status || !payload.activeAlerts || !payload.delays || !payload.reducedSpeedZones || !payload.plannedClosures) {
    return null;
  }
  return fromBackendPayload(payload);
}

async function loadDashboardFromLegacyEndpoints(): Promise<DashboardData | null> {
  const [mapData, statusData, activeAlerts, delays, reducedSpeedZones, plannedClosures, performanceData] = await Promise.all([
    fetchSafe<MapApiResponse>("/api/map"),
    fetchSafe<StatusApiResponse>("/api/status"),
    fetchSafe<ActiveAlert[]>("/api/alerts"),
    fetchSafe<DelayAlert[]>("/api/alerts?type=delay"),
    fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown"),
    fetchSafe<PlannedClosure[]>("/api/alerts?type=planned"),
    fetchSafe<TtcPerformanceSnapshot>("/api/performance")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !delays || !reducedSpeedZones || !plannedClosures;
  if (useFallback) {
    return null;
  }

  return fromBackendPayload({
    map: mapData,
    status: statusData,
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    performance: performanceData ?? fallbackPerformance,
  });
}

export async function loadDashboardInitialData(): Promise<DashboardData> {
  return await loadDashboardFromAggregate()
    ?? await loadDashboardFromLegacyEndpoints()
    ?? fallbackDashboardData();
}
```

- [ ] **Step 4: Slow dashboard refresh defaults**

Modify constants in `frontend/src/components/LineWatchShell.tsx`:

```ts
const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;
const MIN_DASHBOARD_REFRESH_MS = 10_000;
```

Do not change the visibility guard. The existing `document.visibilityState !== "visible"` check must remain.

- [ ] **Step 5: Add dashboard refresh build arg to frontend Dockerfile**

Modify `frontend/Dockerfile` in the builder stage:

```dockerfile
ARG NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS
ENV NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=${NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS}
```

Place it beside the other `NEXT_PUBLIC_*` build args and envs.

- [ ] **Step 6: Pass dashboard refresh build arg in production build script**

Modify `scripts/prod-build-push.sh` in the frontend image build arguments:

```bash
  --build-arg "NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=${NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS:-30000}" \
```

Place it with the other frontend `--build-arg` entries.

- [ ] **Step 7: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 8: Run frontend typecheck and lint**

Run:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/tests/dashboard-data.test.mjs \
  frontend/src/app/dashboard-data.ts \
  frontend/src/components/LineWatchShell.tsx \
  frontend/Dockerfile \
  scripts/prod-build-push.sh
git commit -m "perf: reduce dashboard refresh origin load"
```

---

## Task 3: Caddy Cache-Control Headers

**Files:**

- Create: `frontend/tests/caddy-cache-headers.test.mjs`
- Modify: `Caddyfile`
- Modify: `Caddyfile.staging`

- [ ] **Step 1: Write source guardrail tests for Caddy cache policy**

Create `frontend/tests/caddy-cache-headers.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const prodCaddyfile = readFileSync(new URL("../../Caddyfile", import.meta.url), "utf8");
const stagingCaddyfile = readFileSync(new URL("../../Caddyfile.staging", import.meta.url), "utf8");

function assertCachePolicy(source, label) {
  assert.match(source, /\(linewatch_cache_headers\)/, `${label} should define reusable cache headers`);
  assert.match(source, /@linewatch_static_cache/, `${label} should define static cache matcher`);
  assert.match(source, /\/_next\/static\/\*/, `${label} should cache Next static chunks`);
  assert.match(source, /\/assets\/\*/, `${label} should cache public assets`);
  assert.match(source, /@linewatch_public_api_cache/, `${label} should define public API cache matcher`);
  assert.match(source, /\/api\/dashboard/, `${label} should cache aggregate dashboard endpoint`);
  assert.match(source, /\/api\/alerts/, `${label} should cache public alert endpoint`);
  assert.match(source, /s-maxage=30/, `${label} should expose a short shared-cache TTL`);
  assert.match(source, /@linewatch_private_api_no_store/, `${label} should define private API no-store matcher`);
  assert.match(source, /\/api\/auth\/\*/, `${label} should keep auth uncached`);
  assert.match(source, /\/api\/account\/\*/, `${label} should keep account APIs uncached`);
  assert.match(source, /\/api\/feedback/, `${label} should keep feedback uncached`);
  assert.match(source, /Cache-Control "no-store"/, `${label} should set no-store`);
}

describe("Caddy cache headers", () => {
  it("sets public and private cache headers in production", () => {
    assertCachePolicy(prodCaddyfile, "Caddyfile");
  });

  it("sets matching public and private cache headers in staging", () => {
    assertCachePolicy(stagingCaddyfile, "Caddyfile.staging");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test frontend/tests/caddy-cache-headers.test.mjs
```

Expected: FAIL because the matchers are not present yet.

- [ ] **Step 3: Add reusable cache header snippet to `Caddyfile`**

Modify `Caddyfile` after `(linewatch_security_headers)`:

```caddyfile
(linewatch_cache_headers) {
	@linewatch_static_cache {
		path /_next/static/* /assets/*
	}
	header @linewatch_static_cache Cache-Control "public, max-age=31536000, immutable"

	@linewatch_public_api_cache {
		path /api/dashboard /api/status /api/map /api/alerts /api/performance /api/accessibility-outages /api/surface-notices
	}
	header @linewatch_public_api_cache Cache-Control "public, max-age=15, s-maxage=30, stale-while-revalidate=30"

	@linewatch_private_api_no_store {
		path /api/auth/* /api/account/* /api/feedback /api/health* /api/actuator*
	}
	header @linewatch_private_api_no_store Cache-Control "no-store"
}
```

Then import it inside both site blocks:

```caddyfile
	import linewatch_cache_headers
```

For `api.linewatchto.ca`, the static matcher is harmless; the important part is public/private API headers.

- [ ] **Step 4: Add matching cache header snippet to `Caddyfile.staging`**

Modify `Caddyfile.staging` after `(linewatch_staging_security_headers)`:

```caddyfile
(linewatch_cache_headers) {
	@linewatch_static_cache {
		path /_next/static/* /assets/*
	}
	header @linewatch_static_cache Cache-Control "public, max-age=31536000, immutable"

	@linewatch_public_api_cache {
		path /api/dashboard /api/status /api/map /api/alerts /api/performance /api/accessibility-outages /api/surface-notices
	}
	header @linewatch_public_api_cache Cache-Control "public, max-age=15, s-maxage=30, stale-while-revalidate=30"

	@linewatch_private_api_no_store {
		path /api/auth/* /api/account/* /api/feedback /api/health* /api/actuator*
	}
	header @linewatch_private_api_no_store Cache-Control "no-store"
}
```

Then import it in the `:8080` site block:

```caddyfile
	import linewatch_cache_headers
```

- [ ] **Step 5: Run Caddy cache header tests**

Run:

```bash
node --test frontend/tests/caddy-cache-headers.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Validate Caddy syntax**

Run:

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
docker run --rm -v "$PWD/Caddyfile.staging:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: both commands report valid configuration. If Docker cannot pull `caddy:2-alpine` because network is unavailable, record that and rely on the source test until deployment validation.

- [ ] **Step 7: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/tests/caddy-cache-headers.test.mjs Caddyfile Caddyfile.staging
git commit -m "infra: add public cache headers for dashboard reads"
```

---

## Task 4: Cloudflare And Surge Runbook

**Files:**

- Create: `docs/traffic-spike-runbook.md`
- Modify: `README.md`

- [ ] **Step 1: Write the runbook**

Create `docs/traffic-spike-runbook.md`:

```markdown
# Traffic Spike Runbook

LineWatchTO is designed to tolerate public traffic spikes first through cheap reads and short-lived edge caching, not Kubernetes. This runbook assumes the current single Oracle Ampere VPS remains the origin.

## Scope

This runbook covers public, anonymous dashboard traffic:

- `linewatchto.ca`
- `www.linewatchto.ca`
- `api.linewatchto.ca`

It must not cache account, auth, push, feedback, or write endpoints.

## Baseline Origin Risk

The dashboard is map-first and mostly public, but visible clients refresh periodically. The production default should be `30s`, with surge builds allowed to use `60s`.

During a spike, total visitors matter less than active visible sessions:

```text
active sessions ~= visits per minute * average visible session minutes
origin read pressure ~= active sessions / dashboard refresh interval
```

## Cloudflare Free Setup

1. Add `linewatchto.ca` to Cloudflare.
2. Change registrar nameservers to the Cloudflare nameservers.
3. DNS records:

```text
Type  Name  Target        Proxy
A     @     <Oracle IP>   Proxied
A     www   <Oracle IP>   Proxied
A     api   <Oracle IP>   Proxied
```

4. SSL/TLS mode: `Full (strict)`.
5. Keep Caddy serving HTTPS on the VPS.
6. Do not use Cloudflare Flexible SSL.

## Cache Rules

Create Cloudflare Cache Rules in this order.

### Rule 1: Bypass Private And Operational APIs

Expression:

```text
(starts_with(http.request.uri.path, "/api/auth/")) or
(starts_with(http.request.uri.path, "/api/account/")) or
(http.request.uri.path eq "/api/feedback") or
(starts_with(http.request.uri.path, "/api/health")) or
(starts_with(http.request.uri.path, "/actuator"))
```

Action:

```text
Cache eligibility: Bypass cache
```

### Rule 2: Cache Static Assets

Expression:

```text
(starts_with(http.request.uri.path, "/_next/static/")) or
(starts_with(http.request.uri.path, "/assets/"))
```

Action:

```text
Cache eligibility: Eligible for cache
Edge TTL: 1 month
Browser TTL: Respect origin
```

### Rule 3: Cache Public Dashboard APIs

Expression:

```text
(http.request.uri.path in {
  "/api/dashboard"
  "/api/status"
  "/api/map"
  "/api/alerts"
  "/api/performance"
  "/api/accessibility-outages"
  "/api/surface-notices"
})
```

Action:

```text
Cache eligibility: Eligible for cache
Edge TTL: 30 seconds
Browser TTL: Respect origin
Cache key: include query string
```

`/api/alerts?type=delay`, `/api/alerts?type=slowdown`, and `/api/alerts?type=planned` share the same path but must remain distinct by query string.

## Surge Mode

Use surge mode before a known advertisement or public post.

Build frontend with:

```bash
NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=60000 scripts/prod-build-push.sh
```

Deploy normally:

```bash
scripts/prod-deploy.sh <full-git-sha>
```

Recommended surge settings:

```text
Dashboard refresh: 60s
Cloudflare public API edge TTL: 30s
Caddy public API s-maxage: 30s
Redis dashboard TTL: 30s
```

After the spike, rebuild with the default:

```bash
NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=30000 scripts/prod-build-push.sh
scripts/prod-deploy.sh <full-git-sha>
```

## Verification

Run twice for public API paths. The second request should usually be `HIT` or `REVALIDATED` once Cloudflare is proxying and the rule is active.

```bash
curl -I https://linewatchto.ca/api/dashboard
curl -I https://linewatchto.ca/api/dashboard
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
```

Check headers:

```text
cache-control: public, max-age=15, s-maxage=30, stale-while-revalidate=30
cf-cache-status: HIT
```

Private paths must not cache:

```bash
curl -I https://linewatchto.ca/api/auth/config
curl -I https://linewatchto.ca/api/account/commutes
curl -I https://linewatchto.ca/api/feedback
```

Expected:

```text
cache-control: no-store
cf-cache-status: BYPASS, DYNAMIC, or MISS that does not become HIT
```

## Load Test

Run load tests from a separate machine, not the VPS:

```bash
npx autocannon -c 100 -d 60 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/dashboard
```

Watch Grafana:

- CPU by container.
- Backend p95 and p99 latency.
- HTTP 5xx rate.
- JVM heap and GC pauses.
- Hikari pool usage.
- Redis latency/errors.
- Postgres CPU and connections.
- Caddy request rate.

Stop increasing load if p95 exceeds 1s, 5xx responses appear, or CPU is pinned for more than a few minutes.

## Rollback

If Cloudflare caching causes stale or incorrect behavior:

1. Disable Rule 3 first.
2. Purge Cloudflare cache for `/api/*`.
3. Keep static asset caching enabled.
4. If private data is ever observed in a cached response, disable all API cache rules immediately and investigate before re-enabling.
```

- [ ] **Step 2: Add README link**

Modify `README.md` near the deployment/production docs section:

```markdown
For traffic-spike preparation, Cloudflare cache rules, surge-mode dashboard refresh, and production verification, see [docs/traffic-spike-runbook.md](docs/traffic-spike-runbook.md).
```

Do not claim a tested visitor capacity number unless a load test has been run and recorded.

- [ ] **Step 3: Run documentation/source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/traffic-spike-runbook.md README.md
git commit -m "docs: add traffic spike runbook"
```

---

## Task 5: Cross-Stack Verification And Production Smoke

**Files:**

- No new files.
- This task verifies the full mitigation.

- [ ] **Step 1: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 4: Run smoke tests if local services are available**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If Playwright browsers are missing and network is unavailable, record the exact failure.

- [ ] **Step 5: Validate Caddy config**

Run:

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
docker run --rm -v "$PWD/Caddyfile.staging:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: PASS.

- [ ] **Step 6: Build and deploy staging**

Run:

```bash
scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-compose.sh ps
```

Expected: staging stack healthy and smoke script passes.

- [ ] **Step 7: Verify staging headers**

Run against the staging origin:

```bash
curl -I http://127.0.0.1:8090/api/dashboard
curl -I http://127.0.0.1:8090/api/auth/config
curl -I http://127.0.0.1:8090/assets/linewatch/ttc-subway-map-edited.svg
```

Expected:

```text
/api/dashboard -> Cache-Control: public, max-age=15, s-maxage=30, stale-while-revalidate=30
/api/auth/config -> Cache-Control: no-store
/assets/... -> Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 8: Deploy production**

Build:

```bash
NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=30000 scripts/prod-build-push.sh
```

Deploy:

```bash
scripts/prod-deploy.sh <full-git-sha>
```

Expected: production stack healthy.

- [ ] **Step 9: Verify production endpoint behavior**

Run:

```bash
curl -I https://linewatchto.ca/api/dashboard
curl -I https://linewatchto.ca/api/auth/config
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
```

Expected before Cloudflare proxying:

```text
/api/dashboard -> Cache-Control: public, max-age=15, s-maxage=30, stale-while-revalidate=30
/api/auth/config -> Cache-Control: no-store
/assets/... -> Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 10: Enable Cloudflare and verify edge caching**

Follow `docs/traffic-spike-runbook.md`.

Run each public path twice:

```bash
curl -I https://linewatchto.ca/api/dashboard
curl -I https://linewatchto.ca/api/dashboard
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
```

Expected on the second request:

```text
cf-cache-status: HIT
```

Verify private paths:

```bash
curl -I https://linewatchto.ca/api/auth/config
curl -I https://linewatchto.ca/api/account/commutes
curl -I https://linewatchto.ca/api/feedback
```

Expected:

```text
cache-control: no-store
cf-cache-status: BYPASS, DYNAMIC, or a non-HIT status
```

- [ ] **Step 11: Record final capacity notes**

Create a short note in the final handoff with:

```text
Frontend refresh default:
Cloudflare public API TTL:
Static asset TTL:
Backend /api/dashboard status:
Backend tests:
Frontend tests:
Caddy validation:
Production header verification:
Cloudflare CF-Cache-Status verification:
Known limits:
```

Do not claim “handles tens of thousands of concurrent users” unless a load test proves it.

---

## Completion Criteria

This implementation is complete only when:

- `/api/dashboard` exists and returns the public dashboard payload.
- Frontend initial data loading prefers `/api/dashboard`.
- Legacy frontend fan-out fallback still works if `/api/dashboard` is unavailable.
- Fixture fallback still works when backend data is unavailable.
- Visible dashboard refresh default is `30s`, with build-time surge override support.
- Caddy sets public cache headers on public dashboard reads and immutable static assets.
- Caddy sets `no-store` on auth/account/feedback/health-style paths.
- Cloudflare cache rules are documented with exact public/private behavior.
- README links the runbook.
- Backend tests pass.
- Frontend fixture tests, typecheck, lint, and build pass.
- Production or staging headers have been verified with `curl -I`.

---

## Self-Review

- Spec coverage: The plan covers lower polling rate, one aggregate dashboard read, Caddy cache-control headers, Cloudflare Free cache rules, private-route bypass, verification, surge mode, and rollback.
- Placeholder scan: No task contains unresolved placeholder instructions. The production deploy SHA is intentionally represented as `<full-git-sha>` because it is produced by the build script at execution time.
- Type consistency: Backend DTO names are `DashboardResponses.DashboardResponse`; frontend response type is `DashboardApiResponse`; cache key is `dashboard:full`; cache property is `fullDashboardTtl` / `full-dashboard-ttl`.
