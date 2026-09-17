import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopRailDestinationForView } from "../src/app/desktop-sidebar-state.ts";

describe("desktop navigation destinations", () => {
  const RAIL_DESTINATIONS = ["status", "stations", "commutes", "alert-history", "more", "source-status"];

  it("defines the agreed desktop rail destinations in order", () => {
    assert.deepEqual(RAIL_DESTINATIONS, ["status", "stations", "commutes", "alert-history", "more", "source-status"]);
  });

  it("maps views to top-level desktop destinations", () => {
    const destinationForView = desktopRailDestinationForView;

    assert.equal(destinationForView("status"), "status");
    assert.equal(destinationForView("alerts"), "status");
    assert.equal(destinationForView("delays"), "status");
    assert.equal(destinationForView("reduced-speed-zones"), "status");
    assert.equal(destinationForView("search"), "status");
    assert.equal(destinationForView("commutes"), "commutes");
    assert.equal(destinationForView("my-stations"), "stations");
    assert.equal(destinationForView("saved"), "stations");
    assert.equal(destinationForView("alert-history"), "alert-history");
    assert.equal(destinationForView("source-status"), "source-status");
    assert.equal(destinationForView("analytics"), "more");
    assert.equal(destinationForView("feedback"), "more");
    assert.equal(destinationForView("map"), "status");
  });
});
