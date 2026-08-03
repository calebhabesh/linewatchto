import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

function impact(status) {
  return {
    status,
    severity: status === "clear" ? "clear" : status === "planned" ? "planned" : "minor",
    statusLabel: status === "clear" ? "Clear" : status === "planned" ? "Planned impact" : "Affected now",
    detail: "",
    matchedImpacts: status === "affected"
      ? [{
          id: "impact-1",
          kind: "delay",
          status: "current",
          severity: "minor",
          title: "Delay",
          lineId: "line-1",
          lineNumber: "1",
          location: "Station to Station",
          displayDirection: null,
          source: "Fixture",
          matchedSegmentIds: [],
          matchedStationIds: [],
        }]
      : [],
  };
}

function ignoredCurrentImpact() {
  return {
    status: "clear",
    severity: "clear",
    statusLabel: "Clear",
    detail: "Only ignored route impacts match this commute.",
    matchedImpacts: [{
      id: "rsz-ignored",
      kind: "reduced-speed-zone",
      status: "current",
      severity: "minor",
      title: "Reduced Speed Zone",
      lineId: "line-1",
      lineNumber: "1",
      location: "Sheppard West to Wilson",
      displayDirection: "Southbound",
      source: "Fixture",
      matchedSegmentIds: ["line-1-sheppard-west-wilson"],
      matchedStationIds: [],
      ignoredByRule: true,
    }],
  };
}

function path() {
  return {
    status: "available",
    stationIds: ["origin", "destination"],
    segmentIds: ["segment-1"],
    segmentHops: [],
    lineIds: ["line-1"],
    transferStationIds: [],
    estimatedTravelSeconds: 300,
    weightSource: "topology-fallback",
    summary: "Fixture path",
  };
}

function leg(id, routeLabel, legImpact) {
  return {
    id,
    routeLabel,
    fromStationId: id === "outbound" ? "origin" : "destination",
    fromStationName: id === "outbound" ? "Origin" : "Destination",
    toStationId: id === "outbound" ? "destination" : "origin",
    toStationName: id === "outbound" ? "Destination" : "Origin",
    path: path(),
    impact: legImpact,
  };
}

function commute(id, outboundImpact, returnImpact = null) {
  return {
    id,
    label: id,
    originStationId: "origin",
    originStationName: "Origin",
    destinationStationId: "destination",
    destinationStationName: "Destination",
    routeLabel: "Origin -> Destination",
    watchReturnTrip: Boolean(returnImpact),
    outboundLeg: leg("outbound", "Origin -> Destination", outboundImpact),
    returnLeg: returnImpact ? leg("return", "Destination -> Origin", returnImpact) : null,
    path: path(),
    impact: outboundImpact,
    createdAt: "2026-06-05T14:30:00Z",
    updatedAt: "2026-06-05T14:30:00Z",
  };
}

describe("saved commute menu counts", () => {
  it("loads saved commutes from the shell instead of waiting for the panel to mount", () => {
    assert.match(shellSource, /getSavedCommutes/);
    assert.match(shellSource, /setAccountCommutes\(result\.commutes\)/);
    assert.doesNotMatch(savedCommutesSource, /getSavedCommutes/);
  });

  it("passes the desktop commute status counts through to the mobile More menu badges", () => {
    assert.match(shellSource, /commuteClearCount=\{commuteClearCount\}/);
    assert.match(shellSource, /commuteAffectedCount=\{commuteAffectedCount\}/);
    assert.match(mobileMoreSource, /mobile-commute-status-badges/);
    assert.match(mobileMoreSource, /aria-label=\{`\$\{commuteClearCount\} clear commutes`\}/);
    assert.match(mobileMoreSource, /aria-label=\{`\$\{commuteAffectedCount\} affected commutes`\}/);
  });

  it("counts one affected-now route when either monitored commute leg is affected", async () => {
    const accountData = await import("../src/app/account-data.ts");

    assert.equal(typeof accountData.summarizeSavedCommuteStatuses, "function");
    assert.deepEqual(
      accountData.summarizeSavedCommuteStatuses([
        commute("clear-both-ways", impact("clear"), impact("clear")),
        commute("return-only-affected", impact("clear"), impact("affected")),
        commute("both-legs-affected", impact("affected"), impact("affected")),
        commute("planned-not-now", impact("planned"), null),
        commute("ignored-rsz", ignoredCurrentImpact(), null),
      ]),
      {
        clear: 2,
        affectedNow: 2,
      }
    );
  });
});
