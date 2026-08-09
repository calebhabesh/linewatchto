import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioRoot = new URL("../../backend/src/test/resources/fixtures/ttc-alert-scenarios/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("scenario-index.json", scenarioRoot), "utf8"));
const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-custom.svg", import.meta.url),
  "utf8",
);

describe("alert scenario catalog", () => {
  it("contains TTC Live Alerts feed envelopes for every indexed scenario", () => {
    assert.equal(index.scenarios.length, 7);
    for (const scenario of index.scenarios) {
      const feed = JSON.parse(readFileSync(new URL(scenario.file, scenarioRoot), "utf8"));
      assert.ok(Array.isArray(feed.routes), `${scenario.name} routes array`);
      assert.ok(Array.isArray(feed.accessibility), `${scenario.name} accessibility array`);
      assert.equal(feed.routes.length, scenario.routeCount, `${scenario.name} route count`);
      assert.equal(feed.accessibility.length, scenario.accessibilityCount, `${scenario.name} accessibility count`);
    }
  });

  it("makes all-alert-types cover every backend-to-map alert surface", () => {
    const scenario = index.scenarios.find((candidate) => candidate.name === "all-alert-types");
    assert.ok(scenario);
    assert.equal(scenario.routeCount, 24);
    assert.equal(scenario.accessibilityCount, 2);
    assert.deepEqual(scenario.directionCoverage, {
      "delay": ["bidirectional", "directional"],
      "planned-closure": ["bidirectional", "directional"],
      "reduced-speed-zone": ["bidirectional", "directional", "unknown"],
      "suspension": ["bidirectional", "directional"],
    });
    assert.deepEqual(scenario.stationAlertAssetTypes, ["elevator", "escalator"]);
    assert.deepEqual(scenario.sourceKinds, ["modeled-gap-fill", "synthetic-template"]);
    assert.deepEqual(
      Object.keys(scenario.coverageMatrix).sort(),
      [
        "accessibility-elevator",
        "accessibility-escalator",
        "delay-bidirectional-segment",
        "delay-bidirectional-station",
        "delay-directional-segment",
        "delay-directional-station",
        "delay-multi-dot-interchange-station",
        "planned-closure-bidirectional-static",
        "planned-closure-directional-moving",
        "planned-closure-long-upcoming",
        "reduced-speed-zone-bidirectional",
        "reduced-speed-zone-directional",
        "reduced-speed-zone-directionless",
        "suspension-bidirectional-segment",
        "suspension-directional-segment",
        "suspension-four-way-junction-station-line-1",
        "suspension-four-way-junction-station-line-2",
      ],
    );
    assert.equal(scenario.coverageMatrix["planned-closure-bidirectional-static"].sourceKind, "synthetic-template");
    assert.equal(scenario.coverageMatrix["reduced-speed-zone-directional"].sourceKind, "synthetic-template");
    assert.equal(scenario.coverageMatrix["accessibility-elevator"].sourceKind, "synthetic-template");
    assert.equal(scenario.coverageMatrix["accessibility-escalator"].sourceKind, "synthetic-template");
    assert.equal(scenario.coverageMatrix["delay-bidirectional-station"].sourceKind, "modeled-gap-fill");
    assert.equal(scenario.coverageMatrix["delay-directional-station"].sourceKind, "modeled-gap-fill");
    assert.equal(scenario.coverageMatrix["delay-multi-dot-interchange-station"].sourceKind, "modeled-gap-fill");
    assert.equal(scenario.coverageMatrix["suspension-four-way-junction-station-line-1"].sourceKind, "modeled-gap-fill");
    assert.equal(scenario.coverageMatrix["suspension-four-way-junction-station-line-2"].sourceKind, "modeled-gap-fill");
    assert.equal(scenario.coverageMatrix["reduced-speed-zone-directionless"].sourceKind, "modeled-gap-fill");
    assert.deepEqual(
      [...scenario.guidePathIds].sort(),
      ["seg-line-1-st-andrew-union", "seg-line-1-union-king"],
    );

    const feed = JSON.parse(readFileSync(new URL(scenario.file, scenarioRoot), "utf8"));
    const routesById = new Map(feed.routes.map((route) => [route.id, route]));

    assert.equal(routesById.get("scenario-delay-line-4")?.effectDesc, "Delays");
    assert.equal(routesById.get("scenario-delay-line-1-dupont-spadina")?.effectDesc, "Delays");
    assert.equal(routesById.get("scenario-delay-line-2-jane-runnymede")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-delay-line-2-main-street-kennedy")?.effectDesc, "Delays");
    assert.equal(routesById.get("scenario-delay-line-2-main-street-kennedy")?.direction, "Both ways");
    assert.deepEqual(
      routesById.get("scenario-delay-line-2-main-street-kennedy")?.stopIDList,
      ["Main Street", "Victoria Park", "Warden", "Kennedy"],
    );
    assert.equal(routesById.get("scenario-station-node-keele")?.stopStart, "Keele");
    assert.equal(routesById.get("scenario-station-node-keele")?.stopEnd, "Keele");
    assert.equal(routesById.get("scenario-station-node-jane-overlap")?.stopStart, "Jane");
    assert.equal(routesById.get("scenario-station-node-jane-overlap")?.stopEnd, "Jane");
    assert.deepEqual(routesById.get("scenario-station-node-jane-overlap")?.stopIDList, ["Jane"]);
    assert.equal(routesById.get("scenario-station-node-dundas-west-bidirectional")?.stopStart, "Dundas West");
    assert.equal(routesById.get("scenario-station-node-dundas-west-bidirectional")?.stopEnd, "Dundas West");
    assert.deepEqual(routesById.get("scenario-station-node-dundas-west-bidirectional")?.stopIDList, ["Dundas West"]);
    assert.equal(routesById.get("scenario-station-node-dundas-west-bidirectional")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-station-node-union-vaughan")?.stopStart, "Union");
    assert.equal(routesById.get("scenario-station-node-union-vaughan")?.stopEnd, "Union");
    assert.deepEqual(routesById.get("scenario-station-node-union-vaughan")?.stopIDList, ["Union"]);
    assert.equal(routesById.get("scenario-station-node-union-vaughan")?.direction, "Northbound To Vaughan Metropolitan Centre");
    assert.equal(routesById.get("scenario-station-node-spadina")?.stopStart, "Spadina");
    assert.equal(routesById.get("scenario-station-node-spadina")?.stopEnd, "Spadina");
    assert.deepEqual(routesById.get("scenario-station-node-spadina")?.stopIDList, ["Spadina"]);
    assert.equal(routesById.get("scenario-station-node-spadina")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-active-line-2")?.effect, "NO_SERVICE");
    assert.equal(routesById.get("scenario-active-line-2")?.stopEnd, "Kennedy");
    assert.deepEqual(
      routesById.get("scenario-active-line-2")?.stopIDList,
      [
        "Broadview",
        "Chester",
        "Pape",
        "Donlands",
        "Greenwood",
        "Coxwell",
        "Woodbine",
        "Main Street",
        "Victoria Park",
        "Warden",
        "Kennedy",
      ],
    );
    assert.equal(routesById.has("scenario-active-line-1-st-andrew-union"), false);
    assert.equal(routesById.get("scenario-active-line-1-dupont-cedarvale")?.effect, "NO_SERVICE");
    assert.equal(routesById.get("scenario-active-line-1-dupont-cedarvale")?.direction, "Both ways");
    assert.deepEqual(
      routesById.get("scenario-active-line-1-dupont-cedarvale")?.stopIDList,
      ["Dupont", "St Clair West", "Cedarvale"],
    );
    assert.equal(routesById.get("scenario-active-line-1-king-union")?.effect, "NO_SERVICE");
    assert.equal(routesById.get("scenario-active-line-1-king-union")?.direction, "Southbound");
    assert.deepEqual(routesById.get("scenario-active-line-1-king-union")?.stopIDList, ["King", "Union"]);
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-1")?.stopStart, "Bloor-Yonge");
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-1")?.stopEnd, "Bloor-Yonge");
    assert.deepEqual(routesById.get("scenario-station-node-bloor-yonge-line-1")?.stopIDList, ["Bloor-Yonge"]);
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-1")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-1")?.effect, "NO_SERVICE");
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-2")?.stopStart, "Bloor-Yonge");
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-2")?.stopEnd, "Bloor-Yonge");
    assert.deepEqual(routesById.get("scenario-station-node-bloor-yonge-line-2")?.stopIDList, ["Bloor-Yonge"]);
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-2")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-station-node-bloor-yonge-line-2")?.effect, "NO_SERVICE");
    assert.equal(routesById.get("scenario-delay-line-1-union-st-andrew")?.effectDesc, "Delays");
    assert.equal(routesById.get("scenario-delay-line-1-union-st-andrew")?.direction, "Northbound");
    assert.deepEqual(routesById.get("scenario-delay-line-1-union-st-andrew")?.stopIDList, ["Union", "St Andrew"]);
    assert.equal(routesById.get("scenario-active-line-1-museum-st-george")?.direction, "Northbound");
    assert.equal(routesById.get("synthetic-rsz-line-1")?.effectDesc, "Reduced Speed Zone");
    assert.equal(routesById.get("synthetic-rsz-line-1")?.title, "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.");
    assert.equal(routesById.get("scenario-rsz-line-2-jane-runnymede")?.direction, "Both ways");
    assert.equal(routesById.get("scenario-rsz-line-1-wilson-yorkdale-directionless")?.direction, null);
    assert.equal(routesById.get("synthetic-planned-line-1")?.alertType, "Planned");
    assert.equal(routesById.get("synthetic-planned-line-1")?.direction, "Both ways");
    assert.ok(routesById.get("synthetic-planned-line-1")?.childAlerts.length > 0);
    assert.equal(
      scenario.coverageMatrix["planned-closure-bidirectional-static"].sourceId,
      "synthetic-planned-line-1",
    );
    assert.equal(routesById.get("scenario-planned-line-1-northbound-early-access")?.direction, "Northbound");
    assert.equal(
      scenario.coverageMatrix["planned-closure-directional-moving"].sourceId,
      "scenario-planned-line-1-northbound-early-access",
    );
    assert.equal(routesById.get("scenario-planned-line-2-long-upcoming")?.alertType, "Planned");
    assert.equal(routesById.get("scenario-planned-line-2-long-upcoming")?.route, "2");
    assert.equal(routesById.get("scenario-planned-line-2-long-upcoming")?.stopStart, "Broadview");
    assert.equal(routesById.get("scenario-planned-line-2-long-upcoming")?.stopEnd, "Kennedy");
    assert.deepEqual(feed.accessibility.map((record) => record.routeType).sort(), ["Elevator", "Escalator"]);
  });

  it("references nonlinear guide paths that exist in the custom TTC SVG", () => {
    const guideIds = index.scenarios.flatMap((scenario) => scenario.guidePathIds);
    assert.deepEqual(
      [...new Set(guideIds)].sort(),
      [
        "seg-line-1-st-andrew-union",
        "seg-line-1-st-george-spadina",
        "seg-line-1-union-king",
      ],
    );

    for (const guideId of guideIds) {
      assert.match(svg, new RegExp(`inkscape:label="${guideId}"`));
    }
  });
});
