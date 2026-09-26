import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  recordGeographicMapLifecycle,
  getGeographicMapLifecycle,
} from "../src/app/geographic-lifecycle.ts";
import { updateGeographicDynamicSources } from "../src/components/geographic-map-operations.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("Geographic map lifecycle seam: counters, events, and reset", async (t) => {
  // Polyfill window for node environment test
  globalThis.window = globalThis;

  await t.test("records constructor, loading, ready, resize, and setStyle events accurately", () => {
    const stats = getGeographicMapLifecycle();
    assert.ok(stats, "stats store should be initialized");
    stats.reset();

    assert.equal(stats.constructors, 0);
    assert.equal(stats.removals, 0);
    assert.equal(stats.styleReplacements, 0);
    assert.equal(stats.loadingTransitions, 0);
    assert.equal(stats.readyTransitions, 0);
    assert.equal(stats.errorTransitions, 0);
    assert.equal(stats.resizes, 0);
    assert.equal(stats.sourceUpdates, 0);
    assert.equal(stats.events.length, 0);

    recordGeographicMapLifecycle("loading", "init");
    assert.equal(stats.loadingTransitions, 1);

    recordGeographicMapLifecycle("constructor", "network:ttc");
    assert.equal(stats.constructors, 1);

    recordGeographicMapLifecycle("ready", "map loaded");
    assert.equal(stats.readyTransitions, 1);

    recordGeographicMapLifecycle("resize", "1200x800");
    assert.equal(stats.resizes, 1);

    recordGeographicMapLifecycle("setStyle", "dark");
    assert.equal(stats.styleReplacements, 1);

    recordGeographicMapLifecycle("sourceUpdate", "impacts");
    assert.equal(stats.sourceUpdates, 1);

    recordGeographicMapLifecycle("error", "webglcontextlost");
    assert.equal(stats.errorTransitions, 1);

    recordGeographicMapLifecycle("removal", "cleanup");
    assert.equal(stats.removals, 1);

    assert.equal(stats.events.length, 8);
    assert.equal(stats.events[0].type, "loading");
    assert.equal(stats.events[1].type, "constructor");
    assert.equal(stats.events[2].type, "ready");
    assert.equal(stats.events[3].type, "resize");
    assert.equal(stats.events[4].type, "setStyle");
    assert.equal(stats.events[5].type, "sourceUpdate");
    assert.equal(stats.events[6].type, "error");
    assert.equal(stats.events[7].type, "removal");

    stats.reset();
    assert.equal(stats.constructors, 0);
    assert.equal(stats.sourceUpdates, 0);
    assert.equal(stats.events.length, 0);
  });
});

test("Geographic map component invariants: lifecycle separation and stability", async (t) => {
  const compPath = path.resolve(__dirname, "../src/components/GeographicNetworkMap.tsx");
  const compSource = fs.readFileSync(compPath, "utf8");

  await t.test("initialization useEffect does not depend on dynamic data, selection, filters, or theme", () => {
    // Look for the main map lifecycle useEffect dependency array
    const initEffectMatch = compSource.match(/Main Map lifecycle: owns creation[\s\S]*?\}, \[(.*?)\]\);/);
    assert.ok(initEffectMatch, "Main map lifecycle useEffect must be documented and found");
    const deps = initEffectMatch[1];

    assert.ok(deps.includes("network"), "deps should include network");
    assert.ok(deps.includes("retryCount"), "deps should include retryCount");
    assert.ok(!deps.includes("isDark"), "deps must NOT include isDark (theme handled separately)");
    assert.ok(!deps.includes("activeFilteredLine"), "deps must NOT include activeFilteredLine");
    assert.ok(!deps.includes("selectedStationId"), "deps must NOT include selectedStationId");
    assert.ok(!deps.includes("selection"), "deps must NOT include selection");
    assert.ok(!deps.includes("commutePathPreview"), "deps must NOT include commutePathPreview");
    assert.ok(!deps.includes("resolvedNetworkSegments"), "deps must NOT include resolvedNetworkSegments");
    assert.ok(!deps.includes("resolvedStationNodeImpacts"), "deps must NOT include resolvedStationNodeImpacts");
  });

  await t.test("event listeners use callbacksRef to avoid stale closures without reinstalling the map", () => {
    assert.ok(
      compSource.includes("const callbacksRef = useRef({"),
      "Component must use callbacksRef to store latest callbacks",
    );
    assert.ok(
      compSource.includes("callbacksRef.current.onSelectStationId"),
      "Listeners must invoke callbacks via callbacksRef",
    );
    assert.ok(
      compSource.includes("callbacksRef.current.onSelectImpact"),
      "Listeners must invoke onSelectImpact via callbacksRef",
    );
  });

  await t.test("theme change effect compares applied style identity and only updates on genuine change", () => {
    assert.ok(
      compSource.includes("appliedStyleUrlRef.current === targetStyle"),
      "Theme effect must check whether applied style already matches target style",
    );
    assert.ok(
      compSource.includes('map.once("style.load"'),
      "Theme effect must register style.load rehydration listener",
    );
  });

  await t.test("container ResizeObserver is registered and coalesced with requestAnimationFrame", () => {
    assert.ok(compSource.includes("new ResizeObserver"), "ResizeObserver must be used for container");
    assert.ok(compSource.includes("requestAnimationFrame"), "Resize callbacks must be coalesced via requestAnimationFrame");
    assert.ok(compSource.includes("cancelAnimationFrame"), "Animation frame must be cancelled on cleanup");
  });

  await t.test("dynamic data updates mutate GeoJSON sources in-place via setData and record sourceUpdates", () => {
    const stats = getGeographicMapLifecycle();
    stats.reset();

    const updated = [];
    const createMockSource = (name) => ({
      setData: (data) => updated.push({ name, data }),
    });
    const sources = {
      "transit-impacts": createMockSource("transit-impacts"),
      "transit-impact-stations": createMockSource("transit-impact-stations"),
      "transit-impact-badges": createMockSource("transit-impact-badges"),
      "transit-impact-arrows": createMockSource("transit-impact-arrows"),
      "transit-train-markers": createMockSource("transit-train-markers"),
      "transit-commute-links": createMockSource("transit-commute-links"),
      "transit-commute-stations": createMockSource("transit-commute-stations"),
    };
    const mockMap = {
      getSource: (id) => sources[id],
      hasImage: () => true,
    };
    const sampleData = {
      impactedLinks: { type: "FeatureCollection", features: [{ id: "l1" }] },
      impactedStations: { type: "FeatureCollection", features: [{ id: "s1" }] },
      impactBadges: { type: "FeatureCollection", features: [] },
      impactArrows: { type: "FeatureCollection", features: [] },
      trainMarkers: { type: "FeatureCollection", features: [] },
      commuteLinks: { type: "FeatureCollection", features: [{ id: "c1" }] },
      commuteStations: { type: "FeatureCollection", features: [{ id: "cs1" }] },
    };

    updateGeographicDynamicSources(mockMap, sampleData);

    assert.equal(stats.sourceUpdates, 1, "Should record sourceUpdate in lifecycle stats");
    assert.equal(updated.length, 7, "All 7 dynamic sources should receive setData");
    assert.equal(updated.find((s) => s.name === "transit-impacts")?.data, sampleData.impactedLinks);
    assert.equal(updated.find((s) => s.name === "transit-impact-stations")?.data, sampleData.impactedStations);
    assert.equal(updated.find((s) => s.name === "transit-impact-badges")?.data, sampleData.impactBadges);
    assert.equal(updated.find((s) => s.name === "transit-commute-links")?.data, sampleData.commuteLinks);
    assert.equal(updated.find((s) => s.name === "transit-commute-stations")?.data, sampleData.commuteStations);
    assert.equal(updated.find((s) => s.name === "transit-impact-arrows")?.data, sampleData.impactArrows);
    assert.equal(updated.find((s) => s.name === "transit-train-markers")?.data, sampleData.trainMarkers);
  });

  await t.test("error handler does not degrade usable map to error overlay on transient tile failures", () => {
    assert.ok(
      compSource.includes('loadStatusRef.current !== "ready"'),
      "Tile error handling must guard against resetting ready status",
    );
  });
});
