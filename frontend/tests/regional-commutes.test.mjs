import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import { readShellSource } from "./helpers/shell-source.mjs";
import { readRegionalMapSource, readTtcMapSource } from "./helpers/map-source.mjs";

const panelSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("../src/components/SavedCommuteCard.tsx", import.meta.url), "utf8");
const draftEditorSource = readFileSync(new URL("../src/components/SavedCommuteRouteDraftEditor.tsx", import.meta.url), "utf8");
const shellSource = readShellSource();
const regionalMapSource = readRegionalMapSource();
const accountDataSource = readFileSync(new URL("../src/app/commute-data.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("regional My Commutes UI boundary", () => {
  it("shows an account-wide route list while keeping route creation network-specific", () => {
    assert.match(shellSource, /networkId=\{selectedNetwork\}/);
    assert.match(panelSource, /type AccountNetworkFilter = "all" \| NetworkId/);
    assert.match(panelSource, /accountCommutes\.filter\([\s\S]*networkFilter === "all"/);
    assert.doesNotMatch(panelSource, /const networkCommutes/);
    assert.match(panelSource, /networkId: draftNetworkId,\s*originStationId/);
    assert.match(panelSource, /stationCatalogs\[draftNetworkId\]/);
    assert.match(panelSource, /aria-label="Filter My Commutes by network"/);
    assert.match(panelSource, /GO & UP/);
    assert.match(accountDataSource, /networkId\?: NetworkId/);
  });

  it("switches to a commute's network before opening its map path or impact", () => {
    assert.match(shellSource, /const commuteNetwork = commute\.networkId \?\? "ttc"/);
    assert.match(shellSource, /setSelectedNetwork\(commuteNetwork\)/);
    assert.match(shellSource, /networkTransitionTargetRef\.current = null;/);
    assert.match(cardSource, /account-network-badge/);
  });

  it("brings solid alert overlay to the front over commute path preview without fast/slow selection flash for both map modes", () => {
    // Both maps: while a commute is previewed, the selected alert's whole tube
    // repaints over it with no selection flash (the shared overlay layer).
    const lineAlertSource = readFileSync(new URL("../src/components/map-overlays/LineAlertOverlays.tsx", import.meta.url), "utf8");
    assert.match(lineAlertSource, /commutePreviewActive \? \(\s*<g key=\{`commute:\$\{alert\.key\}`\} data-selected-commute-impact-overlay=\{alert\.impactId\}>[\s\S]*?<MapLineAlertTube[\s\S]*?\) : \(\s*<path[\s\S]*?map-selection-flash/);
    const ttcMapSource = readTtcMapSource();
    assert.match(ttcMapSource, /commutePreviewActive=\{commutePreviewActive\}/);

    // Station alerts skip their selection flash under a commute preview too.
    const stationAlertSource = readFileSync(new URL("../src/components/map-overlays/StationAlertOverlays.tsx", import.meta.url), "utf8");
    assert.match(stationAlertSource, /const flashing = !commutePreviewActive && isSelectedStationAlert\(alert, selection\);/);
  });

  it("supports route review and endpoint, label, and return-leg editing", () => {
    assert.match(panelSource, /updateSavedCommute\(editingCommuteId/);
    assert.match(panelSource, /startEditingCommute/);
    assert.match(draftEditorSource, /Edit Route/);
    assert.match(accountDataSource, /export async function updateSavedCommute/);
  });

  it("renders regional path previews and regional route notification controls", () => {
    // GO/UP draws the shared commute preview (map-overlays/CommutePreviewOverlays.tsx).
    const regionalCommuteSource = readFileSync(new URL("../src/app/regional-commute-preview.ts", import.meta.url), "utf8");
    assert.match(regionalCommuteSource, /preview\.segmentIds/);
    assert.match(regionalCommuteSource, /pill: regionalStationPill\(geometry, anchorId\)/);
    assert.match(regionalMapSource, /<g id=\{layerId\("dynamic-commute"\)\} aria-label="Commute route preview">\s*<MapCommutePreviewRoute preview=\{commutePreview\} \/>/);
    assert.match(regionalMapSource, /<MapCommuteEndpointFlashes preview=\{commutePreview\} plane=\{overlayPlane\} \/>/);
    assert.doesNotMatch(globalCss, /regional-commute/);
    assert.match(globalCss, /\.commute-path-preview-glow,\s*\.commute-path-preview-path\s*\{[^}]*stroke-linecap:\s*round;/s);
    assert.match(cardSource, /Route Notifications:/);
    assert.doesNotMatch(panelSource, /Regional Notifications: Not available yet/);
    assert.doesNotMatch(cardSource, /Regional Notifications: Not available yet/);
    assert.doesNotMatch(panelSource, /excluded from TTC push matching/);
  });

  it("labels regional travel-time modeling as a low-confidence planning estimate", () => {
    assert.match(cardSource, /Topology Planning Estimate/);
    assert.match(draftEditorSource, /low-confidence planning estimates/);
    assert.match(accountDataSource, /regional-topology-estimate/);
  });
});
