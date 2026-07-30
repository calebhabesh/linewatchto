import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const accountDataSource = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");

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
    assert.match(panelSource, /account-network-badge/);
  });

  it("supports route review and endpoint, label, and return-leg editing", () => {
    assert.match(panelSource, /updateSavedCommute\(editingCommuteId/);
    assert.match(panelSource, /startEditingCommute/);
    assert.match(panelSource, /Edit route/);
    assert.match(accountDataSource, /export async function updateSavedCommute/);
  });

  it("renders regional path previews and regional route notification controls", () => {
    assert.match(regionalMapSource, /regional-commute-path-preview-layer/);
    assert.match(regionalMapSource, /commutePathPreview\.segmentIds/);
    assert.match(panelSource, /Route Notifications:/);
    assert.doesNotMatch(panelSource, /Regional Notifications: Not available yet/);
    assert.doesNotMatch(panelSource, /excluded from TTC push matching/);
  });

  it("labels regional travel-time modeling as a low-confidence planning estimate", () => {
    assert.match(panelSource, /Topology Planning Estimate/);
    assert.match(panelSource, /low-confidence planning estimates/);
    assert.match(accountDataSource, /regional-topology-estimate/);
  });
});
