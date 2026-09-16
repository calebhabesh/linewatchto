import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopRailDestinationForView } from "../src/app/desktop-sidebar-state.ts";

describe("desktop navigation destinations", () => {
  const RAIL_DESTINATIONS = ["status", "search", "saved", "more"];

  it("defines the agreed four top-level desktop destinations", () => {
    assert.deepEqual(RAIL_DESTINATIONS, ["status", "search", "saved", "more"]);
  });

  it("maps views to top-level desktop destinations", () => {
    const destinationForView = desktopRailDestinationForView;

    assert.equal(destinationForView("status"), "status");
    assert.equal(destinationForView("alerts"), "status");
    assert.equal(destinationForView("delays"), "status");
    assert.equal(destinationForView("reduced-speed-zones"), "status");
    assert.equal(destinationForView("search"), "search");
    assert.equal(destinationForView("commutes"), "saved");
    assert.equal(destinationForView("my-stations"), "saved");
    assert.equal(destinationForView("analytics"), "more");
    assert.equal(destinationForView("feedback"), "more");
    assert.equal(destinationForView("map"), "status");
  });
});
