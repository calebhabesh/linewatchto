import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopRailDestinationForView } from "../src/app/desktop-sidebar-state.ts";

describe("desktop navigation destinations", () => {
  const RAIL_DESTINATIONS = ["status", "search", "stations", "commutes", "more"];

  it("defines the agreed five top-level desktop destinations in order", () => {
    assert.deepEqual(RAIL_DESTINATIONS, ["status", "search", "stations", "commutes", "more"]);
  });

  it("maps views to top-level desktop destinations", () => {
    const destinationForView = desktopRailDestinationForView;

    assert.equal(destinationForView("status"), "status");
    assert.equal(destinationForView("alerts"), "status");
    assert.equal(destinationForView("delays"), "status");
    assert.equal(destinationForView("reduced-speed-zones"), "status");
    assert.equal(destinationForView("search"), "search");
    assert.equal(destinationForView("commutes"), "commutes");
    assert.equal(destinationForView("my-stations"), "stations");
    assert.equal(destinationForView("saved"), "stations");
    assert.equal(destinationForView("analytics"), "more");
    assert.equal(destinationForView("feedback"), "more");
    assert.equal(destinationForView("map"), "status");
  });
});
