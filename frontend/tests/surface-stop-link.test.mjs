import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isWellFormedStopCode,
  parseSurfaceStopLink,
  searchWithStopLink,
  stopLinkPath,
} from "../src/app/surface-stop-link.ts";
import { parseNavigationDeepLinks } from "../src/app/navigation-transitions.ts";
import {
  createSearchPlaceStore,
  searchBackLabel,
  surfaceBackStep,
} from "../src/app/search-return.ts";

const parse = (search) => parseSurfaceStopLink(new URLSearchParams(search));

describe("stop links (plan 14, U7)", () => {
  it("reads a TTC stop by default and a GO stop with network=regional", () => {
    assert.deepEqual(parse("stop=7658"), { network: "ttc", code: "7658", wellFormed: true });
    assert.deepEqual(parse("network=ttc&stop=100"), { network: "ttc", code: "100", wellFormed: true });
    assert.deepEqual(parse("network=regional&stop=00008"), { network: "regional", code: "00008", wellFormed: true });
  });

  it("restores GO leading zeros but never pads TTC numbers", () => {
    assert.equal(parse("network=regional&stop=8")?.code, "00008");
    assert.equal(parse("stop=0042")?.code, "0042");
    assert.equal(parse("network=regional&stop=123456")?.code, "123456");
  });

  it("marks values that cannot be stop numbers instead of dropping them, and caps their length", () => {
    assert.deepEqual(parse("stop=abc"), { network: "ttc", code: "abc", wellFormed: false });
    assert.equal(parse("stop=12;34")?.wellFormed, false);
    assert.equal(parse("stop=123456789")?.wellFormed, false);
    assert.equal(parse(`stop=${"x".repeat(200)}`)?.code.length, 16);
    assert.equal(parse("stop= 7658 ")?.code, "7658");
  });

  it("ignores a missing or empty stop", () => {
    assert.equal(parse(""), null);
    assert.equal(parse("stop="), null);
    assert.equal(parse("stop=%20"), null);
  });

  it("accepts digits only, 1 to 8 of them", () => {
    assert.equal(isWellFormedStopCode("1"), true);
    assert.equal(isWellFormedStopCode("00008"), true);
    assert.equal(isWellFormedStopCode(""), false);
    assert.equal(isWellFormedStopCode("７６５８"), false);
    assert.equal(isWellFormedStopCode("-1"), false);
  });

  it("writes the open stop into the address and takes it off on close", () => {
    assert.equal(searchWithStopLink("", { network: "ttc", code: "7658" }), "?stop=7658");
    assert.equal(searchWithStopLink("?previewTime=x", { network: "regional", code: "00008" }), "?previewTime=x&network=regional&stop=00008");
    // A station link gives way; a TTC stop drops the GO network.
    assert.equal(searchWithStopLink("?network=regional&station=union&stop=00008", { network: "ttc", code: "100" }), "?stop=100");
    assert.equal(searchWithStopLink("?network=ttc&stop=100", null), "?network=ttc");
    assert.equal(searchWithStopLink("?stop=100", null), "");
    assert.equal(stopLinkPath({ network: "regional", code: "00008" }), "/?network=regional&stop=00008");
    // The address round-trips.
    assert.deepEqual(parse(searchWithStopLink("", { network: "regional", code: "00008" }).slice(1)),
      { network: "regional", code: "00008", wellFormed: true });
  });

  it("is a launch deep link after impact, station and line links, and keeps its parameter", () => {
    const stop = parseNavigationDeepLinks(new URLSearchParams("stop=7658"));
    assert.deepEqual(stop.stopDeepLink, { network: "ttc", code: "7658", wellFormed: true });
    assert.equal(stop.requestedNetwork, null);
    assert.equal(stop.shouldReplaceUrl, false);
    assert.equal(stop.cleanedParams.get("stop"), "7658");

    const go = parseNavigationDeepLinks(new URLSearchParams("network=regional&stop=00008&panel=alerts"));
    assert.equal(go.requestedNetwork, "regional");
    assert.equal(go.stopDeepLink?.code, "00008");
    assert.equal(go.panelView, null);
    assert.equal(go.cleanedParams.has("panel"), false);

    assert.equal(parseNavigationDeepLinks(new URLSearchParams("network=ttc&station=spadina&stop=1")).stopDeepLink, null);
    assert.equal(parseNavigationDeepLinks(new URLSearchParams("line=1&stop=1")).stopDeepLink, null);
    assert.equal(parseNavigationDeepLinks(new URLSearchParams("impactKind=delay&impactId=d&stop=1")).stopDeepLink, null);
  });
});

describe("back to search (plan 14, U7)", () => {
  it("steps back one panel at a time: stop → route → search", () => {
    assert.equal(surfaceBackStep({ stopOpen: true, routeOpen: false, routeReturn: true, searchReturn: true }), "route");
    assert.equal(surfaceBackStep({ stopOpen: false, routeOpen: true, routeReturn: false, searchReturn: true }), "search");
    assert.equal(surfaceBackStep({ stopOpen: true, routeOpen: false, routeReturn: false, searchReturn: true }), "search");
    assert.equal(surfaceBackStep({ stopOpen: true, routeOpen: false, routeReturn: false, searchReturn: false }), null);
    assert.equal(surfaceBackStep({ stopOpen: false, routeOpen: false, routeReturn: false, searchReturn: true }), null);
  });

  it("restores a saved place once, only when asked and only for its query", () => {
    const store = createSearchPlaceStore();
    const place = { query: "dufferin", scrollTop: 600, expansion: { query: "dufferin", stops: true, routes: false, places: ["a"] }, focusIndex: 4 };
    assert.equal(store.requestRestore(), null);
    store.save(place);
    // Saving alone restores nothing: search reopened some other way starts fresh.
    assert.equal(store.pendingRestore("dufferin"), null);
    assert.equal(store.requestRestore(), place);
    assert.equal(store.pendingRestore("king"), null);
    // Peeking twice is safe (effects can run twice); finishing uses it up.
    assert.equal(store.pendingRestore("dufferin"), place);
    assert.equal(store.pendingRestore("dufferin"), place);
    store.finishRestore();
    assert.equal(store.pendingRestore("dufferin"), null);
    // A new result opened replaces the place and any waiting restore.
    store.requestRestore();
    store.save({ ...place, scrollTop: 0 });
    assert.equal(store.pendingRestore("dufferin"), null);
    store.clear();
    assert.equal(store.requestRestore(), null);
  });

  it("names the Back row after the query, or the empty box", () => {
    assert.deepEqual(searchBackLabel(" dufferin "), {
      title: "Back to Search",
      detail: "Results for “dufferin”",
      ariaLabel: "Back to search results for dufferin",
    });
    assert.equal(searchBackLabel("").detail, "Stops Near Me and Recent Stops");
    assert.equal(searchBackLabel("").ariaLabel, "Back to search");
  });
});
