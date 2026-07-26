import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { stationImpactKindsByStation, stationImpactSelection } from "../src/app/station-impact-types.ts";

const stationSearch = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const myStations = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const badges = readFileSync(new URL("../src/components/StationImpactTypeBadges.tsx", import.meta.url), "utf8");
const outageBadge = readFileSync(new URL("../src/components/StationOutageBadge.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station impact type badges", () => {
  it("resolves Reduced Speed Zone source alerts before their broad delay severity", () => {
    const selection = stationImpactSelection("rsz-source-1", {
      activeAlerts: [{
        id: "rsz-source-1",
        severity: "delay",
      }],
      delays: [],
      plannedClosures: [],
      reducedSpeedZones: [{
        id: "rsz-group-1",
        sourceAlertIds: ["rsz-source-1"],
      }],
    });

    assert.deepEqual(selection, { kind: "reduced-speed-zone", id: "rsz-group-1" });
  });

  it("derives ordered, deduplicated impact kinds from station nodes and adjacent segments", () => {
    const kinds = stationImpactKindsByStation({
      stationNodeImpacts: [
        { stationId: "bloor-yonge", kind: "delay", cardId: "delay-1", title: "Delay" },
        { stationId: "bloor-yonge", kind: "suspension", cardId: "alert-1", title: "Suspension" },
      ],
      networkSegments: [{
        id: "segment-1",
        stationAId: "bloor-yonge",
        stationBId: "sherbourne",
        impacts: [
          { kind: "delay", cardId: "delay-1", travelDirection: "bidirectional", sourceAlertIds: [] },
          { kind: "reduced-speed-zone", cardId: "rsz-1", travelDirection: "bidirectional", sourceAlertIds: [] },
        ],
      }],
    });

    assert.deepEqual(kinds.get("bloor-yonge"), ["suspension", "delay", "reduced-speed-zone"]);
    assert.deepEqual(kinds.get("sherbourne"), ["delay", "reduced-speed-zone"]);
  });

  it("uses the shared unframed badges in main search and Add Station", () => {
    assert.match(stationSearch, /<StationImpactTypeBadges kinds=\{impactKinds\}/);
    assert.doesNotMatch(stationSearch, />\s*Impact\s*</);
    assert.match(myStations, /<PickerStationConditions station=\{station\} impactKinds=/);
    assert.match(myStations, /<StationImpactTypeBadges kinds=\{impactKinds\}/);
    assert.match(myStations, /<StationOutageBadge assetType="elevator" count=\{outageCounts\.elevator\}/);
    assert.match(myStations, /<ImpactTypeIcon kind=\{kind\} size=\{size\}/);
    assert.match(myStations, /classifiedActiveImpacts/);
    assert.match(myStations, /Reduced Speed Zone/);
    assert.match(outageBadge, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(outageBadge, /\/assets\/linewatch\/outages\/escalator\.svg/);
    assert.doesNotMatch(myStations, /stationState\(station\)\.label/);
    assert.match(badges, /Current service impacts:/);
    assert.match(badges, /<ImpactTypeIcon kind=\{kind\} size=\{18\}/);
    assert.match(styles, /\.station-impact-type-badges\s*\{[^}]*gap:\s*14px;/s);
    assert.match(styles, /\.station-impact-type-badge\s*\{[^}]*height:\s*20px;[^}]*width:\s*20px;/s);
    assert.doesNotMatch(styles, /\.station-impact-type-badge\s*\{[^}]*(?:border|background|border-radius):/s);
    assert.match(myStations, /if \(!hasConditions\) \{\s*return null;/);
  });
});
