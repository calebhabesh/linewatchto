import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station detail panel layout", () => {
  it("uses a right dock on desktop and a bottom sheet on mobile", () => {
    assert.match(panelSource, /station-detail-panel/);
    assert.match(panelSource, /md:right-6/);
    assert.match(panelSource, /md:top-\[104px\]/);
    assert.match(panelSource, /bottom-0/);
    assert.match(panelSource, /rounded-t-lg/);
  });

  it("labels demo arrivals and backend fallback state", () => {
    assert.match(panelSource, /Demo arrival/);
    assert.match(panelSource, /source === "fallback"/);
    assert.match(panelSource, /not live TTC predictions/);
  });

  it("defines station marker and reduced motion styles", () => {
    assert.match(globalCss, /\.station-hit-target/);
    assert.match(globalCss, /\.station-hit-target\.selected/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
  });

  it("keeps the station panel constrained and touch friendly", () => {
    assert.match(panelSource, /max-h-\[64vh\]/);
    assert.match(panelSource, /h-11 w-11/);
    assert.match(panelSource, /overflow-y-auto/);
    assert.doesNotMatch(panelSource, /backdrop-blur/);
  });
});
