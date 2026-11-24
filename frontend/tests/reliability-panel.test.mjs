import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readShellSource } from "./helpers/shell-source.mjs";

const source = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");

describe("official TTC performance panel source", () => {
  it("renders coverage-labeled observed disruption history without an invented score", () => {
    assert.match(source, /reliability\.coverageLabel/);
    assert.match(source, /reliability\.confidence/);
    assert.match(source, /Observed Disruptions · Last 30 Days/);
    assert.match(source, /formatReliabilityTitleCase\(reliability\.coverageLabel\)/);
    assert.match(source, /formatReliabilityTitleCase\(`\$\{reliability\.confidence\} confidence`\)/);
    assert.match(source, /formatDisruptionDuration/);
    assert.match(source, /Share of Incident-Hours/);
    assert.match(source, /Overlapping alerts counted separately/);
    assert.match(source, /During Active Subway Service Only/);
    assert.match(source, /During Scheduled Train Service Only/);
    assert.match(source, /Observed Service Time/);
    assert.match(source, /Station-Weighted Share/);
    assert.match(source, /Service-Stopped Hours/);
    assert.match(source, /Time With Any Alert/);
    assert.match(source, /visibleDisruptionClasses/);
    assert.match(source, /Incident-Hours/);
    assert.match(source, /Median Completed Incident/);
    assert.match(source, /formatReliabilityRange/);
    assert.match(source, /Planned Advisories/);
    assert.match(source, /#FEEC41/);
    assert.match(source, /aria-label="100% stacked bar/);
    assert.match(source, /dark:text-white/);
    assert.match(source, /AlertTypeBreakdownChart/);
    assert.doesNotMatch(source, /Reliability score/);
  });

  it("updates reliability guide methodology copy for station-weighted classes over service dates", () => {
    const guideSource = readFileSync(
      new URL("../src/app/(transit-guides)/transit-guide-components.tsx", import.meta.url),
      "utf8",
    );
    const ttcMeta = readFileSync(
      new URL("../src/app/(transit-guides)/ttc/reliability/page.tsx", import.meta.url),
      "utf8",
    );
    const regionalMeta = readFileSync(
      new URL("../src/app/(transit-guides)/go-up/reliability/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(guideSource, /Station-weighted classes/);
    assert.match(guideSource, /Service Stopped/);
    assert.match(guideSource, /Time With Any Alert/);
    assert.match(guideSource, /Service-Stopped Hours/);
    assert.match(guideSource, /versioned by methodology/);
    assert.doesNotMatch(ttcMeta, /30-day/);
    assert.doesNotMatch(regionalMeta, /30-day/);
  });

  it("renders official TTC performance metrics instead of fake reliability scores", () => {
    assert.match(source, /ttcPerformance/);
    assert.match(source, /Official TTC Performance/);
    assert.match(source, /Source:/);
    assert.doesNotMatch(source, /Reliability Analytics \(7-Day\)/);
    assert.doesNotMatch(source, /incidents7d/);
    assert.doesNotMatch(source, /median delay/);
  });

  it("supports regional corridors with authored badges and schedule-bounded metrics", () => {
    assert.match(source, /TransitLineBadge/);
    assert.match(source, /id\.startsWith\("regional-"\)/);
    assert.match(source, /reliability\.serviceWindowBasis/);
    assert.match(source, /item\.serviceImpactPercentage/);
    assert.match(source, /Train Cancellations · Last 30 Days/);
    assert.match(source, /Distinct Cancelled Trains Observed/);
    assert.match(source, /Exact Schedule Matches/);
    assert.match(source, /Source-Labeled Unmatched/);
    assert.match(source, /reliability\.trainCancellations\.corridors/);
  });

  it("keeps Reliability Analytics accessible in both TTC and GO/UP modes", () => {
    const shellSource = readShellSource();
    const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

    assert.doesNotMatch(shellSource, /selectedNetwork === "ttc" \? [^>]*Reliability Analytics/);
    assert.doesNotMatch(moreSheetSource, /currentNetwork === "ttc" \? [^>]*Reliability Analytics/);
  });
});
