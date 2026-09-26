import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DASHBOARD_REFRESH_MS,
  MIN_DASHBOARD_REFRESH_MS,
  dashboardRefreshIntervalMs,
  getRequestedRegionalScenario,
  computeLastVerified,
  computeSnapshotReason,
  computeDashboardAvailabilityNotice,
  computeEffectiveDashboards,
  restoreDashboardSnapshots,
} from "../src/hooks/useDashboardSession.ts";
import {
  getDashboardRefresh,
} from "../src/app/dashboard-client.ts";
import {
  SNAPSHOT_RETENTION_MS,
  DASHBOARD_VERIFICATION_MS,
  saveDashboardSnapshot,
  snapshotDashboard,
} from "../src/app/dashboard-snapshot.ts";
import { dashboardDataFromApi } from "../src/app/dashboard-adapter.ts";
import { regionalDashboardData } from "../src/app/regional-data.ts";
import * as fixture from "../src/app/linewatch-data.ts";

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => { store.set(key, String(val)); },
    removeItem: (key) => { store.delete(key); },
  };
}

function sampleLiveTtcData() {
  return dashboardDataFromApi({
    networkId: "ttc",
    availability: "available",
    message: "Live TTC",
    map: { stations: fixture.stations, segments: fixture.networkSegments, stationNodeImpacts: fixture.stationNodeImpacts },
    status: {
      generatedAt: { ...fixture.generatedAt, live: true, lastPoll: "succeeded just now" },
      lines: fixture.lineStatuses,
    },
    activeAlerts: fixture.activeAlerts,
    delays: fixture.delays,
    reducedSpeedZones: fixture.reducedSpeedZones,
    plannedClosures: fixture.plannedClosures,
    performance: fixture.ttcPerformanceSnapshot,
  });
}

describe("useDashboardSession unit tests", () => {
  describe("dashboardRefreshIntervalMs configuration", () => {
    it("returns default interval of 30,000 ms when environment variable is unset", () => {
      const original = process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
      delete process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
      try {
        assert.equal(dashboardRefreshIntervalMs(), DEFAULT_DASHBOARD_REFRESH_MS);
        assert.equal(DEFAULT_DASHBOARD_REFRESH_MS, 30_000);
      } finally {
        if (original !== undefined) {
          process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS = original;
        }
      }
    });

    it("respects configured interval when above minimum", () => {
      const original = process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
      process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS = "45000";
      try {
        assert.equal(dashboardRefreshIntervalMs(), 45_000);
      } finally {
        if (original !== undefined) {
          process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS = original;
        } else {
          delete process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
        }
      }
    });

    it("clamps interval to minimum 10,000 ms when configured lower", () => {
      const original = process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
      process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS = "4000";
      try {
        assert.equal(dashboardRefreshIntervalMs(), MIN_DASHBOARD_REFRESH_MS);
        assert.equal(MIN_DASHBOARD_REFRESH_MS, 10_000);
      } finally {
        if (original !== undefined) {
          process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS = original;
        } else {
          delete process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS;
        }
      }
    });
  });

  describe("getRequestedRegionalScenario URL resolution", () => {
    it("parses valid scenarios on localhost and 127.0.0.1", () => {
      assert.equal(getRequestedRegionalScenario("?regionalScenario=all-impact-types", "localhost"), "all-impact-types");
      assert.equal(getRequestedRegionalScenario("?regionalScenario=shared-station", "127.0.0.1"), "shared-station");
      assert.equal(getRequestedRegionalScenario("?regionalScenario=stale-source", "localhost"), "stale-source");
      assert.equal(getRequestedRegionalScenario("?regionalScenario=none", "localhost"), "none");
    });

    it("ignores unsupported scenario strings", () => {
      assert.equal(getRequestedRegionalScenario("?regionalScenario=unknown-scenario", "localhost"), null);
    });

    it("ignores scenarios when not running on localhost or 127.0.0.1", () => {
      assert.equal(getRequestedRegionalScenario("?regionalScenario=all-impact-types", "linewatch.to"), null);
      assert.equal(getRequestedRegionalScenario("?regionalScenario=all-impact-types", "example.com"), null);
    });

    it("returns null when query string has no scenario", () => {
      assert.equal(getRequestedRegionalScenario("", "localhost"), null);
    });
  });

  describe("computeLastVerified", () => {
    it("returns timestamp when within retention period", () => {
      const now = 1_000_000_000;
      const stored = now - 100_000;
      assert.equal(computeLastVerified(stored, now, SNAPSHOT_RETENTION_MS), stored);
    });

    it("returns null when timestamp exceeds 7-day retention period", () => {
      const now = 1_000_000_000;
      const stored = now - (SNAPSHOT_RETENTION_MS + 1);
      assert.equal(computeLastVerified(stored, now, SNAPSHOT_RETENTION_MS), null);
    });

    it("returns null when stored timestamp is null", () => {
      assert.equal(computeLastVerified(null, 1_000_000_000), null);
    });
  });

  describe("computeSnapshotReason", () => {
    const baseParams = {
      connectionOffline: false,
      requestState: "ready",
      sessionVerified: true,
      storedVerifiedAt: 100_000,
      snapshotClock: 105_000,
      offlineShell: false,
      lastVerified: 100_000,
    };

    it("prioritizes connectionOffline as 'offline'", () => {
      assert.equal(computeSnapshotReason({ ...baseParams, connectionOffline: true }), "offline");
    });

    it("returns 'reconnecting' when request state is reconnecting", () => {
      assert.equal(computeSnapshotReason({ ...baseParams, requestState: "reconnecting" }), "reconnecting");
    });

    it("returns 'refreshing' when session is not yet verified", () => {
      assert.equal(computeSnapshotReason({ ...baseParams, sessionVerified: false }), "refreshing");
    });

    it("returns 'stale' when verifiedAt is older than DASHBOARD_VERIFICATION_MS (2 minutes)", () => {
      assert.equal(
        computeSnapshotReason({
          ...baseParams,
          storedVerifiedAt: 100_000,
          snapshotClock: 100_000 + DASHBOARD_VERIFICATION_MS + 1_000,
        }),
        "stale",
      );
    });

    it("returns 'reconnecting' when offlineShell is true and lastVerified is null", () => {
      assert.equal(
        computeSnapshotReason({
          ...baseParams,
          offlineShell: true,
          lastVerified: null,
        }),
        "reconnecting",
      );
    });

    it("returns null when all conditions are normal and verified within 2 minutes", () => {
      assert.equal(computeSnapshotReason(baseParams), null);
    });
  });

  describe("computeDashboardAvailabilityNotice", () => {
    it("does not show a connection notice while verifying a newly selected network", () => {
      for (const savedAt of [null, 100_000]) {
        const data = snapshotDashboard(sampleLiveTtcData(), savedAt, "refreshing");
        assert.equal(computeDashboardAvailabilityNotice(data, "ready", 105_000), null);
        assert.equal(data.generatedAt.live, false);
      }
    });

    it("renders snapshot notice when snapshot is present", () => {
      const data = sampleLiveTtcData();
      const withSnapshot = snapshotDashboard(data, 100_000, "offline");
      const notice = computeDashboardAvailabilityNotice(withSnapshot, "ready", 160_000);
      assert.match(notice, /Offline/);
    });

    it("shows real failures during verification and stale snapshots after a switch", () => {
      for (const [reason, prefix] of [["offline", "Offline"], ["reconnecting", "Reconnecting"], ["stale", "Updates unavailable"]]) {
        for (const savedAt of [null, 100_000]) {
          const data = snapshotDashboard(sampleLiveTtcData(), savedAt, reason);
          assert.ok(computeDashboardAvailabilityNotice(data, "ready", 105_000).startsWith(prefix));
        }
      }
    });

    it("renders connection issue notice when reconnecting without snapshot", () => {
      const data = sampleLiveTtcData();
      const notice = computeDashboardAvailabilityNotice(data, "reconnecting", 100_000);
      assert.equal(notice, "Connection Issue — Showing latest dashboard snapshot while LineWatchTO reconnects.");
    });

    it("renders degraded source notice when degraded", () => {
      const data = { ...sampleLiveTtcData(), availability: "degraded" };
      const notice = computeDashboardAvailabilityNotice(data, "ready", 100_000);
      assert.equal(notice, "Source Refresh Issue — Showing the last successful fresh update.");
    });

    it("renders unavailable notice when unavailable", () => {
      const data = { ...sampleLiveTtcData(), availability: "unavailable" };
      const notice = computeDashboardAvailabilityNotice(data, "ready", 100_000);
      assert.equal(notice, "Live service data is unavailable — Showing the fallback dashboard.");
    });

    it("returns null when dashboard is healthy and live", () => {
      const data = sampleLiveTtcData();
      const notice = computeDashboardAvailabilityNotice(data, "ready", 100_000);
      assert.equal(notice, null);
    });
  });

  describe("restoreDashboardSnapshots", () => {
    it("saves initial live TTC data to storage when online and not offlineShell", () => {
      const storage = createMockStorage();
      const initialData = sampleLiveTtcData();
      const now = 500_000;

      const restored = restoreDashboardSnapshots({
        storage,
        initialData,
        offlineShell: false,
        isOnline: true,
        regionalScenarioActive: false,
        now,
      });

      assert.equal(restored.verifiedAt.ttc, now);
      assert.deepEqual(restored.ttcData, initialData);
      assert.ok(storage.getItem("linewatch-dashboard-snapshot-v1:ttc"));
    });

    it("restores saved snapshot when initial data cannot be saved or is offline", () => {
      const storage = createMockStorage();
      const initialData = sampleLiveTtcData();
      const savedData = { ...initialData, message: "Saved previous data" };
      saveDashboardSnapshot(storage, savedData, 200_000);

      const restored = restoreDashboardSnapshots({
        storage,
        initialData: { ...initialData, dataSource: "fallback" },
        offlineShell: true,
        isOnline: false,
        regionalScenarioActive: false,
        now: 300_000,
      });

      assert.equal(restored.verifiedAt.ttc, 200_000);
      assert.equal(restored.ttcData.message, "Saved previous data");
    });

    it("ignores saved regional snapshot when regional scenario is active", () => {
      const storage = createMockStorage();
      saveDashboardSnapshot(storage, regionalDashboardData, 200_000);

      const restored = restoreDashboardSnapshots({
        storage,
        initialData: sampleLiveTtcData(),
        offlineShell: false,
        isOnline: true,
        regionalScenarioActive: true,
        now: 300_000,
      });

      assert.equal(restored.verifiedAt.regional, null);
      assert.equal(restored.regionalData, undefined);
    });
  });

  describe("computeEffectiveDashboards independent network isolation", () => {
    it("preserves independent network snapshot state when one reconnects", () => {
      const ttc = sampleLiveTtcData();
      const regional = regionalDashboardData;

      const dashboards = computeEffectiveDashboards({
        ttcData: ttc,
        regionalData: regional,
        verifiedAt: { ttc: 100_000, regional: 200_000 },
        dashboardRequestStates: { ttc: "reconnecting", regional: "ready" },
        connectionOffline: false,
      });

      assert.ok(dashboards.ttc.snapshot);
      assert.equal(dashboards.ttc.snapshot.reason, "reconnecting");
      assert.equal(dashboards.regional.snapshot, undefined);
    });

    it("snapshots both networks when connection is offline", () => {
      const ttc = sampleLiveTtcData();
      const regional = regionalDashboardData;

      const dashboards = computeEffectiveDashboards({
        ttcData: ttc,
        regionalData: regional,
        verifiedAt: { ttc: 100_000, regional: 200_000 },
        dashboardRequestStates: { ttc: "ready", regional: "ready" },
        connectionOffline: true,
      });

      assert.ok(dashboards.ttc.snapshot);
      assert.equal(dashboards.ttc.snapshot.reason, "offline");
      assert.ok(dashboards.regional.snapshot);
      assert.equal(dashboards.regional.snapshot.reason, "offline");
    });
  });

  describe("getDashboardRefresh named options", () => {
    function apiPayload() {
      return {
        networkId: "ttc",
        availability: "available",
        map: { stations: [], segments: [], stationNodeImpacts: [] },
        status: {
          generatedAt: { time: "8:00 AM", date: "Sep 25, 2026", live: true, lastPoll: "succeeded just now" },
          lines: [],
        },
        activeAlerts: [],
        delays: [],
        reducedSpeedZones: [],
        plannedClosures: [],
        performance: {},
      };
    }

    it("skips reliability request when deferReliability: true is passed as named option", async () => {
      const fetchedUrls = [];
      const mockFetcher = async (url) => {
        fetchedUrls.push(String(url));
        return new Response(JSON.stringify(apiPayload()), { status: 200 });
      };

      const result = await getDashboardRefresh("ttc", {
        fetcher: mockFetcher,
        deferReliability: true,
      });

      assert.equal(result.reliability, null);
      assert.ok(fetchedUrls.some((u) => u.includes("/api/dashboard")));
      assert.ok(!fetchedUrls.some((u) => u.includes("/api/reliability")));
    });

    it("fetches reliability when deferReliability: false is passed as named option", async () => {
      const fetchedUrls = [];
      const mockFetcher = async (url) => {
        fetchedUrls.push(String(url));
        if (String(url).includes("/api/reliability")) {
          return new Response(JSON.stringify({ lines: [] }), { status: 200 });
        }
        return new Response(JSON.stringify(apiPayload()), { status: 200 });
      };

      const result = await getDashboardRefresh("ttc", {
        fetcher: mockFetcher,
        deferReliability: false,
      });

      assert.ok(result.reliability !== null);
      assert.ok(fetchedUrls.some((u) => u.includes("/api/dashboard")));
      assert.ok(fetchedUrls.some((u) => u.includes("/api/reliability")));
    });

    it("maintains backward compatibility with boolean defer flag", async () => {
      const fetchedUrls = [];
      const mockFetcher = async (url) => {
        fetchedUrls.push(String(url));
        return new Response(JSON.stringify(apiPayload()), { status: 200 });
      };

      const result = await getDashboardRefresh("ttc", mockFetcher, true);
      assert.equal(result.reliability, null);
      assert.ok(!fetchedUrls.some((u) => u.includes("/api/reliability")));
    });
  });
});
