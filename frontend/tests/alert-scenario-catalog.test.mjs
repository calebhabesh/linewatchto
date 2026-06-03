import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioRoot = new URL("../../backend/src/test/resources/fixtures/ttc-alert-scenarios/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("scenario-index.json", scenarioRoot), "utf8"));
const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-edited.svg", import.meta.url),
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

  it("references nonlinear guide paths that exist in the edited TTC SVG", () => {
    const guideIds = index.scenarios.flatMap((scenario) => scenario.guidePathIds);
    assert.deepEqual(
      [...new Set(guideIds)].sort(),
      [
        "seg-line-1-dupont-spadina",
        "seg-line-1-spadina-st-george",
        "seg-line-1-st-andrew-union",
        "seg-line-1-union-king",
      ],
    );

    for (const guideId of guideIds) {
      assert.match(svg, new RegExp(`inkscape:label="${guideId}"`));
    }
  });
});
