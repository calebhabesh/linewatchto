import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_NETWORK_ID,
  REGIONAL_JUNCTION_ANCHORS,
  regionalDashboardData,
  regionalStationSummaries,
} from "../src/app/regional-data.ts";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const regionalSvg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");

describe("network-scoped regional dashboard", () => {
  it("keeps TTC as the default and dispatches to separate map implementations", () => {
    assert.equal(DEFAULT_NETWORK_ID, "ttc");
    assert.match(shellSource, /useState<NetworkId>\(DEFAULT_NETWORK_ID\)/);
    assert.match(networkMapSource, /network === "regional"/);
    assert.match(networkMapSource, /<InteractiveRegionalMap/);
    assert.match(networkMapSource, /<InteractiveTtcMap/);
  });

  it("provides all eight corridors and all 72 logical stations as fallback demo data", () => {
    assert.deepEqual(regionalDashboardData.lineStatuses.map((line) => line.number), ["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"]);
    assert.equal(regionalDashboardData.stations.length, 72);
    assert.equal(regionalStationSummaries.stations.length, 72);
    assert.equal(regionalDashboardData.dataSource, "fallback");
    assert.equal(regionalDashboardData.generatedAt.live, false);
    assert.match(regionalDashboardData.generatedAt.lastPoll, /fixture/i);
    const svgLogicalStationIds = [...regionalSvg.matchAll(/inkscape:label="station-([^"]+)"/g)]
      .map((match) => match[1])
      .filter((id) => id !== "text" && !id.endsWith("-ki") && !id.endsWith("-up"))
      .sort();
    assert.deepEqual(regionalDashboardData.stations.map((station) => station.id).sort(), svgLogicalStationIds);
  });

  it("isolates regional station search input from TTC fixtures", () => {
    const ids = new Set(regionalStationSummaries.stations.map((station) => station.id));
    assert.equal(ids.has("pearson-airport"), true);
    assert.equal(ids.has("finch"), false);
    assert.match(shellSource, /setStationSummaries\(regionalStationSummaries\.stations\)/);
  });

  it("keeps grouped junction selection logical while exposing KI and UP route anchors", () => {
    for (const stationId of ["weston", "mount-dennis", "bloor"]) {
      assert.deepEqual(REGIONAL_JUNCTION_ANCHORS[stationId], {
        KI: `station-${stationId}-ki`,
        UP: `station-${stationId}-up`,
      });
    }
    assert.match(regionalMapSource, /closest\("\[data-regional-station-id\]"\)/);
    assert.match(regionalMapSource, /data-regional-station-id/);
  });

  it("gates TTC-only closed-hours and train-marker behavior", () => {
    assert.match(shellSource, /selectedNetwork === "ttc" && subwayOperatingState\.status/);
    assert.match(shellSource, /selectedNetwork === "ttc" && estimatedTrainsEnabled/);
  });

  it("does not invent current disruptions in regional fallback mode", () => {
    assert.deepEqual(regionalDashboardData.activeAlerts, []);
    assert.deepEqual(regionalDashboardData.delays, []);
    assert.deepEqual(regionalDashboardData.plannedClosures, []);
    assert.deepEqual(regionalDashboardData.stationNodeImpacts, []);
    assert.ok(regionalDashboardData.networkSegments.every((segment) => segment.overlay === "clear"));
  });

  it("retains route-wide, station-node, and explicit segment overlay plumbing", () => {
    assert.match(regionalMapSource, /item\.affectedSegmentIds\.length === 0/);
    assert.match(regionalMapSource, /segment\.guidePathId/);
    assert.match(regionalMapSource, /stationNodeImpacts/);
  });

  it("supports pointer, wheel, fit-network, and keyboard map interactions", () => {
    assert.match(regionalMapSource, /onWheel=\{onWheel\}/);
    assert.match(regionalMapSource, /onPointerDown=\{onPointerDown\}/);
    assert.match(regionalMapSource, /event\.key !== "Enter" && event\.key !== " "/);
    assert.match(regionalMapSource, /aria-label="Fit regional network"/);
  });

  it("uses the same React-owned CSS camera model as the stable TTC map", () => {
    assert.match(regionalMapSource, /snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /transform: `translate\(\$\{camera\.x\}px, \$\{camera\.y\}px\) scale\(\$\{camera\.scale\}\)`/);
    assert.match(regionalMapSource, /transformOrigin: "0 0"/);
    assert.match(regionalMapSource, /root\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
    assert.doesNotMatch(regionalMapSource, /root\.setAttribute\("viewBox"/);
  });

  it("does not move or zoom the initialized camera when the dashboard viewport resizes", () => {
    assert.doesNotMatch(regionalMapSource, /new ResizeObserver\(fitNetwork\)/);
    const resizeObserverBody = regionalMapSource.match(/const observer = new ResizeObserver\(\(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
    assert.match(resizeObserverBody, /if \(cameraInitializedRef\.current\) return/);
    assert.doesNotMatch(resizeObserverBody, /setCamera/);
    assert.doesNotMatch(resizeObserverBody, /setFitScale/);
  });

  it("does not replay a stale recenter command after a remount or refresh", () => {
    assert.match(regionalMapSource, /const lastRecenterSignalRef = useRef\(recenterSignal\)/);
    assert.match(regionalMapSource, /recenterSignal === lastRecenterSignalRef\.current/);
  });

  it("does not refit an initialized camera when refreshed dashboard data rebuilds the SVG", () => {
    assert.match(regionalMapSource, /if \(!cameraInitializedRef\.current\)\s*{\s*window\.requestAnimationFrame\(\(\) =>\s*{\s*if \(!cameraInitializedRef\.current\) fitNetwork\(\)/s);
  });
});
