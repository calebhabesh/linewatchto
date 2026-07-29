import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const accountDataSource = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");

describe("TTC My Commutes route review and editing", () => {
  it("offers the shared route editor for TTC as well as regional commutes", () => {
    assert.match(panelSource, /onClick=\{\(\) => startEditingCommute\(commute\)\}/);
    assert.match(panelSource, /aria-label=\{`Edit commute \$\{commute\.label\}`\}/);
    assert.doesNotMatch(
      panelSource,
      /commute\.networkId === "regional" \? <button[\s\S]*?startEditingCommute\(commute\)/,
    );
  });

  it("submits edited endpoints, label, and return-leg choice through the shared update boundary", () => {
    assert.match(
      panelSource,
      /updateSavedCommute\(editingCommuteId, \{ label: newLabel, originStationId, destinationStationId, watchReturnTrip \}\)/,
    );
    assert.match(accountDataSource, /export async function updateSavedCommute/);
    assert.match(accountDataSource, /method: "PATCH"/);
  });

  it("keeps recalculated TTC paths reviewable on the authored map", () => {
    assert.match(panelSource, /onViewPath\(commute, selectedLeg\.id\)/);
    assert.match(ttcMapSource, /commute-path-preview-layer/);
    assert.match(ttcMapSource, /commutePathPreview\.segmentIds/);
  });
});
