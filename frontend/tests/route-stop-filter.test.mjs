import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  countDirectionMatches,
  matchRouteStop,
  routeStopAlternatives,
  routeStopFilterTokens,
} from "../src/app/route-stop-filter.ts";

const find = (query, code, name) => matchRouteStop(routeStopFilterTokens(query), code, name);
const names = {
  1: "Jane St at Annette St South Side",
  2: "Jane St at St Clair Ave West",
  3: "Mount Dennis Station at Bus Bay 2",
  13623: "Jane St at Annette St South Side",
  4: "St Clair Ave West at Jane St",
};
const nameOf = (code) => names[code] ?? `Stop ${code}`;

describe("routeStopFilterTokens", () => {
  it("asks for nothing when the query is blank or only joining words", () => {
    assert.deepEqual(routeStopFilterTokens("   "), []);
    assert.deepEqual(routeStopFilterTokens("at and"), []);
  });

  it("reads a typed stop number however it is written", () => {
    assert.deepEqual(routeStopFilterTokens("stop 13623"), ["13623"]);
    assert.deepEqual(routeStopFilterTokens("#13623"), ["13623"]);
  });
});

describe("matchRouteStop", () => {
  it("matches words in any order, by the start of a word", () => {
    assert.ok(find("annette jane", "1", names[1]));
    assert.ok(find("ann", "1", names[1]));
    assert.equal(find("nnette", "1", names[1]), null);
    assert.equal(find("annette dundas", "1", names[1]), null);
  });

  it("finds a word by its long or short form, as the main search does", () => {
    assert.ok(find("saint clair", "2", names[2]));
    assert.ok(find("st clair avenue", "2", names[2]));
    assert.ok(find("mt dennis", "3", names[3]));
    assert.ok(find("sou", "1", names[1]), "a word's own start, not only its short form");
  });

  it("matches a number anywhere in a stop's number, and in a name", () => {
    assert.deepEqual(find("3623", "13623", names[13623]).code, [[1, 5]]);
    assert.deepEqual(find("00008", "00008", "Union").code, [[0, 5]]);
    assert.ok(find("8", "00008", "Union"), "a GO number without its leading zeros");
    assert.ok(find("jane 13623", "13623", names[13623]), "a word and a number together");
    assert.ok(find("2", "3", names[3]), "Bus Bay 2");
  });

  it("says where to highlight, without overlaps", () => {
    assert.deepEqual(find("ann", "1", names[1]).name, [[11, 14]]);
    assert.deepEqual(find("avenue", "2", names[2]).name, [[20, 23]], "the whole word when matched by short form");
    assert.deepEqual(find("st", "1", names[1]).name, [[5, 7], [19, 21]]);
    assert.deepEqual(find("mount mou", "3", names[3]).name, [[0, 5]]);
  });
});

describe("direction counts and alternatives", () => {
  const south = { direction: 0, label: "Southbound", branches: [{ label: "To Jane", stops: ["1", "2"] }] };
  const north = { direction: 1, label: "Northbound", branches: [{ label: "To Mount Dennis", stops: ["4"] }] };
  const other = { direction: 0, label: "Southbound", branches: [{ label: "To Bay", stops: ["2", "3"] }] };

  it("counts a stop once in a direction", () => {
    const twice = { direction: 0, label: "Southbound", branches: [{ label: "a", stops: ["2"] }, { label: "b", stops: ["2"] }] };
    assert.equal(countDirectionMatches(routeStopFilterTokens("clair"), twice, nameOf), 1);
  });

  it("offers this branch's other direction first, then the other branches", () => {
    const variants = [
      { id: "27A", code: "27A", directions: [other] },
      { id: "27", code: "27", directions: [south, north] },
    ];
    const alternatives = routeStopAlternatives(routeStopFilterTokens("clair"), variants, { variant: "27", direction: 0 }, nameOf);
    assert.deepEqual(alternatives.map((alternative) => alternative.label), ["27 Northbound", "27A Southbound"]);
  });

  it("names only the direction on a route with one branch", () => {
    const alternatives = routeStopAlternatives(routeStopFilterTokens("clair"), [{ id: "27", code: "27", directions: [south, north] }], { variant: "27", direction: 1 }, nameOf);
    assert.deepEqual(alternatives, [{ variant: "27", direction: 0, label: "Southbound", count: 1 }]);
  });

  it("offers nothing when the route has no match", () => {
    assert.deepEqual(routeStopAlternatives(routeStopFilterTokens("zzz"), [{ id: "27", code: "27", directions: [south, north] }], { variant: "27", direction: 0 }, nameOf), []);
  });
});
