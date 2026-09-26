import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const liveSignalIconSource = readFileSync(new URL("../src/components/LiveSignalIcon.tsx", import.meta.url), "utf8");
const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const myStationsPanelSource = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const surfaceConnectionsSource = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
const badgeSource = readFileSync(new URL("../src/components/ArrivalSourceBadge.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("live signal indicator and propagating wave visual effect", () => {
  it("renders Lucide Radio icon geometry with transmitter dot and concentric arcs", () => {
    assert.match(liveSignalIconSource, /viewBox="0 0 24 24"/);
    assert.match(liveSignalIconSource, /live-signal-icon/);
    assert.match(liveSignalIconSource, /live-signal-dot/);
    assert.match(liveSignalIconSource, /live-signal-arc-inner/);
    assert.match(liveSignalIconSource, /live-signal-arc-outer/);
    assert.match(liveSignalIconSource, /aria-hidden="true"/);
    // Lucide radio path coordinates
    assert.match(liveSignalIconSource, /M16\.247 7\.761/);
    assert.match(liveSignalIconSource, /M19\.075 4\.933/);
    assert.match(liveSignalIconSource, /M4\.925 19\.067/);
    assert.match(liveSignalIconSource, /M7\.753 16\.239/);
    assert.match(liveSignalIconSource, /<circle[\s\S]*cx="12"[\s\S]*cy="12"[\s\S]*r="2"/);
  });

  it("defines outward-propagating signal wave animations in stylesheet", () => {
    assert.match(globalCss, /@keyframes live-signal-dot-pulse/);
    assert.match(globalCss, /@keyframes live-signal-wave-inner/);
    assert.match(globalCss, /@keyframes live-signal-wave-outer/);
    assert.match(globalCss, /\.live-signal-icon \.live-signal-dot\s*\{[^}]*animation:\s*live-signal-dot-pulse 2\.1s/s);
    assert.match(globalCss, /\.live-signal-icon \.live-signal-arc-inner\s*\{[^}]*animation:\s*live-signal-wave-inner 2\.1s/s);
    assert.match(globalCss, /\.live-signal-icon \.live-signal-arc-outer\s*\{[^}]*animation:\s*live-signal-wave-outer 2\.1s/s);
    assert.match(globalCss, /\.live-signal-icon\s*\{[^}]*position:\s*relative;\s*top:\s*-1px;/s);
  });

  it("disables wave animation when reduced motion or pause-animations is active", () => {
    assert.match(globalCss, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.live-signal-icon/s);
    assert.match(globalCss, /\.motion-paused \.live-signal-icon/);
  });

  it("renders LiveSignalIcon to the right of the LIVE badge text in ArrivalSourceBadge", () => {
    assert.match(badgeSource, /import\s*\{[^}]*LiveSignalIcon[^}]*\}\s*from\s*"\.\/LiveSignalIcon"/);
    assert.match(badgeSource, /\{label\}[\s\S]*\{label === "Live"\s*\?\s*\(\s*<LiveSignalIcon[\s\S]*ml-1/);
  });

  it("renders LiveSignalIcon in ArrivalTileSourceIndicator for individual live arrival tiles", () => {
    assert.match(stationPanelSource, /<ArrivalTileSourceIndicator/);
    assert.match(regionalStationPanelSource, /<ArrivalTileSourceIndicator/);
    assert.match(myStationsPanelSource, /<ArrivalTileSourceIndicator/);
    assert.match(surfaceConnectionsSource, /<ArrivalTileSourceIndicator/);
  });

  it("renders ArrivalSourceBadge across StationDetailPanel, RegionalStationDetailPanel, MyStationsPanel, and SurfaceConnectionsSection", () => {
    assert.match(stationPanelSource, /<ArrivalSourceBadge\s+label=\{groupSourceLabel\}/);
    assert.match(regionalStationPanelSource, /<ArrivalSourceBadge\s+label=\{statusLabel\}/);
    assert.match(myStationsPanelSource, /<ArrivalSourceBadge[\s\S]*?label=\{sourceLabel\}[\s\S]*?size="compact"/);
    assert.match(surfaceConnectionsSource, /<ArrivalSourceBadge\s+label=\{groupSourceLabel\}/);
  });
});
