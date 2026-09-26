import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createStationRequestSession,
  fetchSavedTtcStationDetails,
  applySavedStationDetailUpdates,
  fetchSavedRegionalStationDetails,
  applySavedRegionalArrivalUpdates,
} from "../src/app/station-request-lifecycle.ts";
import {
  getStationDetail,
} from "../src/app/station-data.ts";
import {
  getRegionalStationArrivals,
  formatRegionalGroupSourceBadgeLabel,
} from "../src/app/regional-arrivals.ts";
import {
  arrivalSourceBadgeClassName,
  regionalArrivalSourceBadgeClassName,
} from "../src/app/arrival-source-badge.ts";

describe("station request lifecycle and concurrency", () => {
  it("reproduces out-of-order race and confirms newest generation wins via StationRequestSession", async () => {
    const session = createStationRequestSession();

    let displayedStationId = null;

    // Simulate two requests: Request 1 (bloor-yonge) is slow (50ms), Request 2 (st-george) is fast (10ms)
    const runRequest1 = async () => {
      const { requestId, signal } = session.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // In an unguarded lifecycle: displayedStationId = "bloor-yonge" (would overwrite st-george!)
      if (session.isCurrent(requestId) && !signal.aborted) {
        displayedStationId = "bloor-yonge";
      }
    };

    const runRequest2 = async () => {
      const { requestId, signal } = session.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (session.isCurrent(requestId) && !signal.aborted) {
        displayedStationId = "st-george";
      }
    };

    const p1 = runRequest1();
    // Request 2 starts slightly later
    await new Promise((resolve) => setTimeout(resolve, 5));
    const p2 = runRequest2();

    await Promise.all([p1, p2]);

    // Request 2 was started second, so its requestId is newer.
    // When Request 1 finishes at 50ms, session.isCurrent(requestId1) is false (and signal was aborted).
    // Result: newest request ("st-george") wins.
    assert.equal(displayedStationId, "st-george");
  });

  it("getStationDetail rethrows AbortError and does NOT substitute demo fixture data on cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await getStationDetail("union", {
          signal: controller.signal,
          fetcher: async (_url, init) => {
            if (init?.signal?.aborted) {
              const err = new DOMException("The user aborted a request.", "AbortError");
              throw err;
            }
            return new Response("{}", { status: 200 });
          },
        });
      },
      (err) => {
        assert.equal(err?.name, "AbortError");
        return true;
      },
    );

    // Normal network failure (not AbortError) SHOULD fall back gracefully to demo data
    const fallbackResult = await getStationDetail("union", {
      fetcher: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    assert.equal(fallbackResult.source, "fallback");
    assert.equal(fallbackResult.data?.id, "union");
  });

  it("getRegionalStationArrivals rethrows AbortError and does NOT substitute fixture data on cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await getRegionalStationArrivals("union-go", {
          signal: controller.signal,
          fetcher: async (_url, init) => {
            if (init?.signal?.aborted) {
              throw new DOMException("The operation was aborted", "AbortError");
            }
            return new Response("{}", { status: 200 });
          },
        });
      },
      (err) => {
        assert.equal(err?.name, "AbortError");
        return true;
      },
    );
  });

  it("bounds active concurrent requests to N stations instead of accumulating across rapid visibility changes", async () => {
    const session = createStationRequestSession();
    const stationIds = ["union", "bloor-yonge", "st-george", "finch", "sheppard-yonge"];
    const N = stationIds.length;

    let activeInFlightRequests = 0;
    let maxConcurrentInFlight = 0;

    const mockFetcher = async (_url, init) => {
      activeInFlightRequests++;
      maxConcurrentInFlight = Math.max(maxConcurrentInFlight, activeInFlightRequests);

      const signal = init?.signal;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          activeInFlightRequests--;
          resolve(new Response(JSON.stringify({ id: "mock", name: "Mock", lines: [] }), { status: 200 }));
        }, 80);

        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          activeInFlightRequests--;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    };

    // Cycle 1: initial fetch for N stations
    const cycle1Session = session.start();
    const p1 = fetchSavedTtcStationDetails(stationIds, { signal: cycle1Session.signal, fetcher: mockFetcher });

    // Rapid visibility change after 10ms (before Cycle 1 completes): starts Cycle 2
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cycle2Session = session.start(); // This aborts cycle1Session.signal
    const p2 = fetchSavedTtcStationDetails(stationIds, { signal: cycle2Session.signal, fetcher: mockFetcher });

    // Another rapid visibility change after another 10ms: starts Cycle 3
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cycle3Session = session.start(); // This aborts cycle2Session.signal
    const p3 = fetchSavedTtcStationDetails(stationIds, { signal: cycle3Session.signal, fetcher: mockFetcher });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Cycles 1 and 2 were aborted mid-flight, returning empty results
    assert.equal(r1.length, 0);
    assert.equal(r2.length, 0);
    // Cycle 3 ran to completion
    assert.equal(r3.length, N);

    // Active concurrent in-flight requests never exceeded N because earlier cycles were aborted on start()
    assert.equal(maxConcurrentInFlight, N);
    // Once settled, in-flight is 0
    assert.equal(activeInFlightRequests, 0);
  });

  it("fetchSavedRegionalStationDetails handles mid-flight cancellation cleanly", async () => {
    const controller = new AbortController();
    const mockFetcher = async (_url, init) => {
      const signal = init?.signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    };

    const promise = fetchSavedRegionalStationDetails(["union-go", "exhibition-go"], {
      signal: controller.signal,
      fetcher: mockFetcher,
    });

    controller.abort();
    const result = await promise;

    // Aborted batch returns empty arrivals and null accessibility cleanly
    assert.deepEqual(result.arrivals, []);
    assert.equal(result.accessibility, null);
  });

  it("applySavedStationDetailUpdates and applySavedRegionalArrivalUpdates preserve last-known good data in failure grace window", () => {
    const now = 1000000;
    const goodDetail = {
      data: {
        id: "union",
        name: "Union",
        lines: [],
        accessible: "accessible",
        stationAlerts: [],
        arrivals: [],
        surfaceConnections: [],
      },
      source: "backend",
      receivedAt: now,
    };

    const current = {
      "ttc:union": goodDetail,
    };

    // A refresh fails with fallback data (HTTP failure grace period: 30s)
    const failedUpdate = {
      data: {
        id: "union",
        name: "Fallback Union",
        lines: [],
        accessible: "accessible",
        stationAlerts: [],
        arrivals: [],
        surfaceConnections: [],
      },
      source: "fallback",
      receivedAt: now + 20000,
    };

    const updated = applySavedStationDetailUpdates(current, [["ttc:union", failedUpdate]], now + 20000);

    // The last-known good data is preserved because 20s is well within the 30s grace window
    assert.equal(updated["ttc:union"].data?.name, "Union");
    assert.equal(updated["ttc:union"].source, "backend");

    // Similarly test regional arrivals (grace period: 90s)
    const goodRegional = {
      source: "backend",
      data: {
        stationId: "union-go",
        stationName: "Union Station",
        availability: "available",
        generatedAt: new Date(now).toISOString(),
        sourceUpdatedAt: new Date(now).toISOString(),
        source: "backend",
        message: "",
        arrivals: [{ lineId: "LW", status: "live" }],
      },
      receivedAt: now,
    };
    const currentRegional = {
      "union-go": goodRegional,
    };
    const failedRegional = {
      source: "fallback",
      data: {
        stationId: "union-go",
        stationName: "Union Station",
        availability: "unavailable",
        generatedAt: new Date(now + 20000).toISOString(),
        sourceUpdatedAt: null,
        source: "fallback",
        message: "Service unavailable",
        arrivals: [],
      },
      receivedAt: now + 20000,
    };

    const updatedRegional = applySavedRegionalArrivalUpdates(
      currentRegional,
      [["union-go", failedRegional]],
      now + 20000,
    );

    assert.equal(updatedRegional["union-go"].source, "backend");
    assert.equal(updatedRegional["union-go"].data.availability, "available");
  });
});

describe("unified arrival badge presentation", () => {
  it("provides canonical class names for all arrival status labels across default and compact sizes", () => {
    assert.equal(arrivalSourceBadgeClassName, regionalArrivalSourceBadgeClassName);

    // Live styling
    const liveDefault = arrivalSourceBadgeClassName("Live", "default");
    const liveCompact = arrivalSourceBadgeClassName("Live", "compact");
    assert.match(liveDefault, /border-emerald-500\/35/);
    assert.match(liveDefault, /text-emerald-700/);
    assert.match(liveCompact, /h-\[20px\]/);

    // Scheduled styling
    const scheduledDefault = arrivalSourceBadgeClassName("Scheduled", "default");
    const scheduledCompact = arrivalSourceBadgeClassName("Scheduled", "compact");
    assert.match(scheduledDefault, /border-slate-400\/35/);
    assert.match(scheduledCompact, /h-\[18\.5px\]/);

    // Mixed styling
    const mixedDefault = arrivalSourceBadgeClassName("Mixed", "default");
    const mixedCompact = arrivalSourceBadgeClassName("Mixed", "compact");
    assert.match(mixedDefault, /border-cyan-500\/35/);
    assert.match(mixedCompact, /text-cyan-700/);

    // Demo styling
    const demoDefault = arrivalSourceBadgeClassName("Demo", "default");
    assert.match(demoDefault, /border-violet-500\/35/);
  });

  it("formatRegionalGroupSourceBadgeLabel produces standard status labels for regional groups", () => {
    assert.equal(
      formatRegionalGroupSourceBadgeLabel([{ status: "live" }]),
      "Live",
    );

    assert.equal(
      formatRegionalGroupSourceBadgeLabel([{ status: "scheduled" }]),
      "Scheduled",
    );

    assert.equal(
      formatRegionalGroupSourceBadgeLabel([{ status: "live" }, { status: "scheduled" }]),
      "Mixed",
    );

    assert.equal(
      formatRegionalGroupSourceBadgeLabel([]),
      "Scheduled",
    );
  });
});
