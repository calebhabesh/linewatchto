import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/SurfaceNoticesPanel.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");

describe("surface notices panel and routing source verification", () => {
  it("verifies LineWatchShell.tsx includes surface-notices view and routing", () => {
    assert.match(shellSource, /"surface-notices"/);
    assert.match(shellSource, /<SurfaceNoticesPanel/);
    assert.match(shellSource, /surfaceNoticeCount/);
    assert.match(shellSource, /activeView === "surface-notices" \?/);
  });

  it("verifies SurfaceNoticesPanel includes search input, category controls, and compact route groups", () => {
    assert.match(panelSource, /type="text"/);
    assert.match(panelSource, /placeholder="Search route, stop, or notice"/);
    assert.match(panelSource, /setCategory/);
    assert.match(panelSource, /groupSurfaceNoticesByRoute/);
    assert.match(panelSource, /surface-notice-route-group/);
    assert.match(panelSource, /surface-notice-stop-row/);
    assert.match(panelSource, /Routes Affected/);
  });

  it("verifies SurfaceNoticesPanel uses a dynamic Stop or Stops field heading", () => {
    assert.match(panelSource, /stopFieldHeading/);
    assert.match(panelSource, /displayStops\.length > 1 \? "Stops" : "Stop"/);
    assert.match(panelSource, /renderCompactField\(stopFieldHeading\(notice\), stopFieldLabel\(notice\)/);
  });

  it("verifies View TTC details links use target='_blank' and rel='noreferrer'", () => {
    assert.match(panelSource, /target="_blank"/);
    assert.match(panelSource, /rel="noreferrer"/);
    assert.match(panelSource, /View TTC details/);
  });

  it("verifies MobileStatusSheet includes surface notices entry", () => {
    assert.match(statusSheetSource, /"surface-notices"/);
    assert.match(statusSheetSource, /mobile-status-btn-surface/);
  });
});
