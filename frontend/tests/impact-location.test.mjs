import assert from "node:assert/strict";
import { test } from "node:test";
import { formatImpactLocation } from "../src/app/impact-location.ts";
import { REGIONAL_ROUTE_DEFINITIONS, regionalLineLabel } from "../src/app/regional-data.ts";

test("general regional labels use full line names, including older snapshot labels", () => {
  for (const route of REGIONAL_ROUTE_DEFINITIONS) {
    const expected = route.number === "UP" ? "UP Express" : `${route.name} Line`;
    assert.equal(regionalLineLabel(route.id), expected);
    assert.equal(formatImpactLocation(`${route.number} corridor`), expected);
    assert.equal(formatImpactLocation(`${route.name} Corridor`), expected);
    assert.equal(formatImpactLocation(`Entire ${route.name} corridor`), `Entire ${expected}`);
    assert.equal(formatImpactLocation(expected), expected);
  }
});

test("station locations and TTC locations keep their supplied bounds", () => {
  for (const location of ["Rutherford ↔ Allandale Waterfront", "Bloor", "Union → Weston", "Jane to Keele", ""])
    assert.equal(formatImpactLocation(location), location);
  assert.equal(formatImpactLocation("Unmapped corridor"), "Unmapped Corridor");
});
