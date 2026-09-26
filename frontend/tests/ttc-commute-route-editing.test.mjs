import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("../src/components/SavedCommuteCard.tsx", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const commuteDataSource = readFileSync(new URL("../src/app/commute-data.ts", import.meta.url), "utf8");

describe("TTC My Commutes route review and editing", () => {
  it("offers the shared route editor for TTC as well as regional commutes", () => {
    assert.match(cardSource, /onClick=\{\(\) => onStartEditingRoute\(commute\)\}/);
    assert.match(panelSource, /onStartEditingRoute=\{startEditingCommute\}/);
    assert.match(cardSource, /aria-label=\{`Edit commute \$\{commute\.label\}`\}/);
    assert.doesNotMatch(
      cardSource,
      /commute\.networkId === "regional" \? <button[\s\S]*?onStartEditingRoute\(commute\)/,
    );
  });

  it("submits edited endpoints, label, and return-leg choice through the shared update boundary", () => {
    assert.match(
      panelSource,
      /updateSavedCommute\(editingCommuteId, \{\s*label: newLabel,\s*originStationId,\s*destinationStationId,\s*watchReturnTrip,?\s*\}\)/,
    );
    assert.match(commuteDataSource, /export async function updateSavedCommute/);
    assert.match(commuteDataSource, /method: "PATCH"/);
  });

  it("keeps recalculated TTC paths reviewable on the authored map", () => {
    assert.match(cardSource, /onViewPath\(commute, selectedLeg\.id\)/);
    assert.match(ttcMapSource, /commute-path-preview-layer/);
    assert.match(ttcMapSource, /commutePathPreview\.segmentIds/);
  });
});
