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
const networkSelectorSource = readFileSync(new URL("../src/components/NetworkSelector.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const regionalSvg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("network-scoped regional dashboard", () => {
  it("keeps TTC as the default and dispatches to separate map implementations", () => {
    assert.equal(DEFAULT_NETWORK_ID, "ttc");
    assert.match(shellSource, /useState<NetworkId>\(DEFAULT_NETWORK_ID\)/);
    assert.match(networkMapSource, /ttcData: DashboardData/);
    assert.match(networkMapSource, /regionalData: DashboardData/);
    assert.match(networkMapSource, /<DataProvider data=\{ttcData\}>/);
    assert.match(networkMapSource, /<DataProvider data=\{regionalData\}>/);
    assert.match(networkMapSource, /<InteractiveRegionalMap/);
    assert.match(networkMapSource, /<InteractiveTtcMap/);
  });

  it("keeps TTC and GO/UP fixed on one linear left-to-right map track", () => {
    assert.match(networkSelectorSource, /className="network-selector-glider"/);
    assert.match(globalsCss, /\.network-selector-glider/);
    assert.match(globalsCss, /\.network-accent-ridges/);
    assert.match(globalsCss, /\.network-map-carousel-track/);
    assert.match(globalsCss, /\.network-map-slide/);
    assert.match(networkMapSource, /network-map-carousel-track/);
    assert.match(networkMapSource, /network-map-slide/);
    assert.match(networkMapSource, /data-camera-direction=.*"right"/s);
    assert.match(networkMapSource, /data-camera-direction=.*"left"/s);
    assert.match(networkMapSource, /regionalSelected \? "network-map-carousel-track--regional"/);
    assert.match(globalsCss, /\.network-map-carousel-track,\s*\.network-legend-track\s*\{[\s\S]*?width:\s*200%/);
    assert.match(globalsCss, /\.network-map-carousel-track--regional,\s*\.network-legend-track--regional\s*\{[\s\S]*?transform:\s*translateX\(-50%\)/);
    assert.match(globalsCss, /\.network-map-slide\s*\{[\s\S]*?flex:\s*0 0 50%/);
    assert.match(globalsCss, /transition:\s*transform 700ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  });

  it("moves both mode-specific legends on the same fixed track as their map", () => {
    assert.match(networkMapLegendsSource, /network-legend-track--regional/);
    assert.match(networkMapLegendsSource, /network-legend-track--reduced-motion/);
    assert.match(shellSource, /<NetworkMapLegends[\s\S]*reducedMotion=\{reducedMotion\}/);
    assert.match(networkMapLegendsSource, /<LegendPane[\s\S]*mode="ttc"/);
    assert.match(networkMapLegendsSource, /<LegendPane[\s\S]*mode="regional"/);
    assert.match(networkMapLegendsSource, /<DataProvider data=\{data\}>/);
    assert.match(networkMapLegendsSource, /data=\{ttcData\}/);
    assert.match(networkMapLegendsSource, /data=\{regionalData\}/);
    assert.match(globalsCss, /\.network-legend-track-viewport\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(globalsCss, /\.network-map-carousel-track,[\s\S]*?\.network-legend-track\s*\{/);
    assert.match(globalsCss, /\.network-map-carousel-track--regional,[\s\S]*?\.network-legend-track--regional\s*\{/);
  });

  it("keeps mode changes as a horizontal slideshow without a map camera entrance", () => {
    assert.doesNotMatch(networkMapSource, /entranceSignal=/);
    assert.doesNotMatch(regionalMapSource, /startInitialFlyIn/);
    assert.doesNotMatch(regionalMapSource, /entryCamera/);
    assert.match(regionalMapSource, /const initializeMapCamera = useCallback/);
    assert.match(regionalMapSource, /setMapTransition\("none"\);[\s\S]*writeMapTransform\(fitted\.camera\)/);
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

  it("docks desktop impact badges to the bottom-left corner across networks", () => {
    assert.match(
      shellSource,
      /desktop-status-chip-row-container fixed bottom-6 left-6/,
    );
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

  it("centers the enlarged default desktop network frame between the upper console and regional impact badges", () => {
    assert.match(regionalMapSource, /\.desktop-status-capsule/);
    assert.match(regionalMapSource, /\.desktop-status-chip-row-container/);
    assert.match(regionalMapSource, /setDesktopMapTopInset/);
    assert.match(regionalMapSource, /setDesktopMapBottomInset/);
    assert.match(regionalMapSource, /computeBoundedMapFrame/);
    assert.match(regionalMapSource, /computeInsetViewportFocus/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0\.025/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 1\.04/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DESKTOP_VERTICAL_OPTICAL_OFFSET_RATIO = 0\.02/);
    assert.match(regionalMapSource, /Math\.min\(64, Math\.max\(32, width \* REGIONAL_MAP_HORIZONTAL_INSET_RATIO\)\)/);
    assert.match(regionalMapSource, /left:\s*horizontalInset/);
    assert.match(regionalMapSource, /right:\s*horizontalInset/);
    assert.match(regionalMapSource, /top:\s*desktopMapTopInset/);
    assert.match(regionalMapSource, /bottom:\s*desktopMapBottomInset/);
    assert.match(regionalMapSource, /desktopFrameHeight = height - desktopMapTopInset - desktopMapBottomInset/);
    assert.match(regionalMapSource, /desktopFrameHeight \* REGIONAL_MAP_DESKTOP_VERTICAL_OPTICAL_OFFSET_RATIO/);
    assert.match(regionalMapSource, /x: focus\.focusX - \(focus\.focusX - frame\.x\) \* REGIONAL_MAP_DEFAULT_FRAME_SCALE/);
    assert.match(regionalMapSource, /y: focus\.focusY - \(focus\.focusY - frame\.y\) \* REGIONAL_MAP_DEFAULT_FRAME_SCALE \+ verticalOpticalOffset/);
    assert.match(regionalMapSource, /scale: frame\.scale \* REGIONAL_MAP_DEFAULT_FRAME_SCALE/);
  });

  it("matches the TTC map fitted zoom range and button increments", () => {
    assert.match(regionalMapSource, /PAN_ZOOM_MIN_RELATIVE_SCALE/);
    assert.match(regionalMapSource, /PAN_ZOOM_MAX_RELATIVE_SCALE/);
    assert.match(regionalMapSource, /clampPanZoomScale\(current\.scale \* factor, fitScale\)/);
    assert.match(regionalMapSource, /clampPanZoomScale\(targetRelativeScale \* fitScale, fitScale\)/);
    assert.match(regionalMapSource, /value=\{relativeScale\}/);
    assert.match(regionalMapSource, /zoomAtCenter\(1\.25\)/);
    assert.match(regionalMapSource, /zoomAtCenter\(1 \/ 1\.25\)/);
  });

  it("uses the same React-owned CSS camera model as the stable TTC map", () => {
    assert.match(regionalMapSource, /snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /transform: `translate\(\$\{camera\.x\}px, \$\{camera\.y\}px\) scale\(\$\{camera\.scale\}\)`/);
    assert.match(regionalMapSource, /transformOrigin: "0 0"/);
    assert.match(regionalMapSource, /root\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
    assert.doesNotMatch(regionalMapSource, /root\.setAttribute\("viewBox"/);
  });

  it("keeps camera animation for explicit regional map controls only", () => {
    assert.match(regionalMapSource, /setMapTransition\("transform 1s cubic-bezier\(0\.25, 1, 0\.5, 1\)"\)/);
    assert.match(regionalMapSource, /programmaticAnimationFrameRef\.current = window\.requestAnimationFrame/);
    assert.match(regionalMapSource, /writeMapTransform\(targetCamera\)/);
    assert.match(regionalMapSource, /window\.setTimeout\(\(\) => \{[\s\S]*setCamera\(\{ \.\.\.cameraRef\.current \}\)/);
    assert.match(regionalMapSource, /cancelCameraAnimation\(\);[\s\S]*dragRef\.current/);
    assert.doesNotMatch(regionalMapSource, /setMapTransition\("transform 1s[^\n]+\);\s*setCamera\(targetCamera\)/);
    assert.doesNotMatch(regionalMapSource, /entryCamera/);
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
    assert.match(regionalMapSource, /if \(cameraInitializedRef\.current \|\| !svgMarkup\) return/);
    assert.match(regionalMapSource, /cameraInitializedRef\.current = true/);
  });
});
