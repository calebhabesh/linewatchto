import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel) => readFileSync(new URL(`../src/components/analytics/${rel}`, import.meta.url), "utf8");

describe("analytics A9 chart primitives and accessibility guardrails", () => {
  it("every SVG primitive provides an accessible name, focusable marks, and non-color encoding", () => {
    for (const file of ["StackedBarChart.tsx", "HeatmapChart.tsx", "HistogramChart.tsx", "CalendarChart.tsx"]) {
      const src = read(file);
      assert.match(src, /role="img"/, `${file} must expose role="img"`);
      assert.match(src, /aria-label=\{/, `${file} must have an accessible name`);
      assert.match(src, /tabIndex=\{0\}/, `${file} must have focusable marks`);
      assert.match(src, /onFocus=/, `${file} must trigger tooltip on keyboard focus`);
      assert.match(src, /onKeyDown=/, `${file} must support keyboard activation`);
      assert.match(src, /<pattern /, `${file} must use SVG patterns so meaning is never color alone`);
    }
    const ranked = read("RankedBarChart.tsx");
    assert.match(ranked, /aria-label=\{accessibleName\}/);
    assert.match(ranked, /<button/);
    assert.match(ranked, /aria-label=\{item\.ariaLabel\}/);
    // A stretched SVG distorts rounded ends.
    assert.doesNotMatch(ranked, /preserveAspectRatio/);
  });

  it("ChartFrame provides Show Table toggle and lazy IntersectionObserver loading", () => {
    const frame = read("ChartFrame.tsx");
    assert.match(frame, /Show Table/);
    assert.match(frame, /Show Chart/);
    assert.match(frame, /aria-pressed=\{showTable\}/);
    assert.match(frame, /IntersectionObserver/);
  });

  it("handles CSV export 429 rate limits and the 20,000-row cap visibly", () => {
    const exp = read("ExportButton.tsx");
    assert.match(exp, /response\.status === 429/);
    assert.match(exp, /10 exports per 10 minutes/);
    assert.match(exp, /export_too_large/);
    assert.match(exp, /20,000-row/);
    assert.match(exp, /role="alert"/);
  });

  it("respects prefers-reduced-motion and keeps chart horizontal scroll local", () => {
    const css = read("analytics.module.css");
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.chartScroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("keeps TTC hotspots filtered by disruption class by default", () => {
    const where = read("WhenAndWhereModules.tsx");
    assert.match(where, /networkId === "ttc" \? "service-stopped" : "all"/);
  });

  it("keeps tiles in full rows and modules in full-width rows, so no card leaves a gap", () => {
    assert.match(read("RankedBarChart.tsx"), /\[4, 3, 2\]\.find\(\(columns\) => count % columns === 0\)/);
    assert.doesNotMatch(read("AnalyticsDashboard.tsx"), /moduleGrid/);
    // Fixed pixel widths left wide cards part-empty and narrow ones scrolling.
    for (const file of ["StackedBarChart.tsx", "HeatmapChart.tsx", "HistogramChart.tsx", "CalendarChart.tsx"]) {
      assert.match(read(file), /useElementSize\(\)/, `${file} must draw at its card's width`);
    }
    // The median marker was drawn over the axis title, and mixed planned with unplanned.
    assert.doesNotMatch(read("HistogramChart.tsx"), /Median|P90/);
  });
});
