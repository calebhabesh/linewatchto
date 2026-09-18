import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  recordGeographicMapLifecycle,
  getGeographicMapLifecycle,
} from "../src/app/geographic-lifecycle.ts";

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

    recordGeographicMapLifecycle("error", "webglcontextlost");
    assert.equal(stats.errorTransitions, 1);

    recordGeographicMapLifecycle("removal", "cleanup");
    assert.equal(stats.removals, 1);

    assert.equal(stats.events.length, 7);
    assert.equal(stats.events[0].type, "loading");
    assert.equal(stats.events[1].type, "constructor");
    assert.equal(stats.events[2].type, "ready");
    assert.equal(stats.events[3].type, "resize");
    assert.equal(stats.events[4].type, "setStyle");
    assert.equal(stats.events[5].type, "error");
    assert.equal(stats.events[6].type, "removal");

    stats.reset();
    assert.equal(stats.constructors, 0);
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

  await t.test("dynamic data updates mutate GeoJSON sources in-place via setData", () => {
    assert.ok(compSource.includes('impactsSource.setData(overlayData.impactedLinks)'), "Impacts source updated in place");
    assert.ok(compSource.includes('impactStationsSource.setData(overlayData.impactedStations)'), "Impact stations source updated in place");
    assert.ok(compSource.includes('badgesSource.setData(overlayData.impactBadges)'), "Impact badges source updated in place");
    assert.ok(compSource.includes('commuteLinksSource.setData(overlayData.commuteLinks)'), "Commute links source updated in place");
  });

  await t.test("error handler does not degrade usable map to error overlay on transient tile failures", () => {
    assert.ok(
      compSource.includes('loadStatusRef.current !== "ready"'),
      "Tile error handling must guard against resetting ready status",
    );
  });
});
