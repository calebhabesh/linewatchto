import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { scheduleAssetNames, validateScheduleAssetSet } from "../../scripts/lib/schedule-asset-validation.mjs";

// The committed files are the bootstrap generation the schedule-assets service publishes on an
// empty volume, and the client's fallback (plan 16); they must pass the checks it publishes with.
const read = (name) => name.endsWith(".csv")
  ? readFileSync(new URL("../../backend/src/main/resources/regional/go-bus-stops.csv", import.meta.url), "utf8")
  : JSON.parse(readFileSync(new URL(`../public/assets/linewatch/geographic/${name}`, import.meta.url), "utf8"));

describe("committed schedule-derived files (plan 16)", () => {
  for (const network of ["ttc", "go"]) {
    it(`${network} set passes the publish validation`, () => {
      const files = Object.fromEntries(scheduleAssetNames(network).map((name) => [name, read(name)]));
      assert.deepEqual(validateScheduleAssetSet(network, files), []);
    });
  }

  it("rejects a drawn route without a stop list and a stop the search index lacks", () => {
    const files = Object.fromEntries(scheduleAssetNames("go").map((name) => [name, read(name)]));
    const drawn = files["go-surface-bus.json"].routes.find((route) => route.drawn).route;
    const routeStops = structuredClone(files["go-surface-bus-route-stops.json"]);
    delete routeStops.routes[drawn];
    const stops = structuredClone(files["go-surface-bus-stops.json"]);
    stops.features.push({ ...stops.features[0], properties: { ...stops.features[0].properties, stopCode: "99999" } });
    const problems = validateScheduleAssetSet("go", { ...files, "go-surface-bus-route-stops.json": routeStops, "go-surface-bus-stops.json": stops });
    assert.ok(problems.some((problem) => problem.includes(`drawn route ${drawn} has no stop list`)), problems.join("\n"));
    assert.ok(problems.some((problem) => problem.includes("lacks stop 99999")), problems.join("\n"));
    assert.ok(problems.some((problem) => problem.includes("go-bus-stops.csv")), "the backend list no longer matches");
  });
});
