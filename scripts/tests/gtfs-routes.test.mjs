import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routesByShortName } from "../lib/gtfs-routes.mjs";

const route = (route_id, route_short_name, route_long_name = route_short_name) => ({ route_id, route_short_name, route_long_name });

describe("routesByShortName", () => {
  it("keeps one record per short name, the one with sampled trips", () => {
    const routes = [route("11260127-11", "11", "Next"), route("09261126-11", "11", "Current"), route("09261126-12", "12")];
    assert.deepEqual(routesByShortName(routes, new Set(["09261126-11", "09261126-12"])).map(r => [r.route_id, r.route_long_name]), [
      ["09261126-11", "Current"],
      ["09261126-12", "12"],
    ]);
  });

  it("keeps the first listed when no record or every record has sampled trips", () => {
    const routes = [route("a-11", "11", "First"), route("b-11", "11", "Second")];
    assert.equal(routesByShortName(routes, new Set()).at(0).route_long_name, "First");
    assert.equal(routesByShortName(routes, new Set(["a-11", "b-11"])).at(0).route_long_name, "First");
  });

  it("leaves a feed with one record per route unchanged", () => {
    const routes = [route("504", "504"), route("1", "1"), route("29", "29")];
    assert.deepEqual(routesByShortName(routes, new Set(["504"])), routes);
  });
});
