import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapLayerSwitchRows, mapLayersDifferFromDefaults } from "../src/app/map-layer-switches.ts";

const noop = () => {};
const trainMarkers = {
  checked: true,
  disabled: false,
  pending: false,
  status: "64 shown",
  ariaLabel: "Toggle estimated train markers (64 shown)",
  onToggle: noop,
};
const state = (overrides = {}) => ({
  trainMarkers,
  streetcarRoutes: true,
  buses: false,
  vehiclePositions: true,
  streetcarPositionsState: null,
  busPositionsState: null,
  goBuses: false,
  goBusPositions: true,
  goBusPositionsState: null,
  ...overrides,
});
const handlers = (overrides = {}) => ({
  streetcarRoutes: noop,
  buses: noop,
  vehiclePositions: noop,
  goBuses: noop,
  goBusPositions: noop,
  ...overrides,
});
const pick = (rows, key) => rows.find((row) => row.key === key);

describe("Map View layer switch rows", () => {
  it("lists the TTC switches in deck order with their ids and accessible names", () => {
    const rows = mapLayerSwitchRows("ttc", "deck", state(), handlers());
    assert.deepEqual(rows.map(({ label, detail }) => [label, detail]), [
      ["Train Markers", "64 Trains"],
      ["Streetcars", "Routes"],
      ["Buses", "Routes"],
      ["Live GPS", "Streetcars"],
    ]);
    assert.deepEqual(rows.map((row) => row.id), [
      "map-layer-train-markers",
      "map-layer-streetcar-routes",
      "map-layer-bus-routes",
      "map-layer-streetcar-positions",
    ]);
    assert.deepEqual(rows.map((row) => row.ariaLabel), [
      "Toggle estimated train markers (64 shown)",
      "Show TTC streetcar routes and stops",
      "Show TTC bus routes and stops",
      "Show live streetcar and bus GPS positions",
    ]);
    assert.deepEqual(rows.filter((row) => row.busToggle).map((row) => row.key), ["buses"]);
  });

  it("lists the GO/UP switches, and never a TTC one", () => {
    const rows = mapLayerSwitchRows("regional", "deck", state(), handlers());
    assert.deepEqual(rows.map(({ label, detail }) => [label, detail]), [
      ["Train Markers", "64 Trains"],
      ["GO Buses", "Routes"],
      ["Live GPS", "With GO Buses"],
    ]);
    assert.deepEqual(rows.map((row) => row.id), [
      "map-layer-train-markers",
      "map-layer-go-bus-routes",
      "map-layer-go-bus-positions",
    ]);
    assert.deepEqual(rows.filter((row) => row.busToggle).map((row) => row.key), ["goBuses"]);
  });

  it("gives the sheet the same rows under ids of its own", () => {
    for (const network of ["ttc", "regional"]) {
      const deck = mapLayerSwitchRows(network, "deck", state(), handlers());
      const sheet = mapLayerSwitchRows(network, "sheet", state(), handlers());
      const withoutId = (rows) => rows.map((row) => ({ ...row, id: null }));
      assert.deepEqual(withoutId(sheet), withoutId(deck));
      const deckIds = new Set(deck.map((row) => row.id));
      assert.ok(sheet.every((row) => !deckIds.has(row.id)), "the deck can stay in the page under an open sheet");
      assert.equal(new Set(sheet.map((row) => row.id)).size, sheet.length);
    }
  });

  it("leaves out switches with nothing to control them", () => {
    const keys = (network, rowState, rowHandlers) => mapLayerSwitchRows(network, "deck", rowState, rowHandlers).map((row) => row.key);
    assert.deepEqual(
      keys("ttc", state({ trainMarkers: undefined }), handlers({ buses: undefined })),
      ["streetcarRoutes", "vehiclePositions"],
    );
    // GO Live GPS follows GO Buses: it shows nothing without them.
    assert.deepEqual(keys("regional", state(), handlers({ goBuses: undefined })), ["trainMarkers"]);
  });

  it("wires each switch to its own handler", () => {
    const calls = [];
    const record = (name) => () => calls.push(name);
    const train = { ...trainMarkers, onToggle: record("trainMarkers") };
    const wired = handlers(Object.fromEntries(
      ["streetcarRoutes", "buses", "vehiclePositions", "goBuses", "goBusPositions"].map((key) => [key, record(key)]),
    ));
    for (const network of ["ttc", "regional"]) {
      for (const row of mapLayerSwitchRows(network, "deck", state({ trainMarkers: train }), wired)) {
        calls.length = 0;
        row.onToggle();
        assert.deepEqual(calls, [row.key]);
      }
    }
  });

  it("captions Live GPS from the sources it reads", () => {
    const ttcLive = (overrides) => pick(mapLayerSwitchRows("ttc", "deck", state(overrides), handlers()), "vehiclePositions");
    assert.equal(ttcLive({ buses: true }).detail, "Streetcars & Buses");
    assert.equal(ttcLive({ streetcarPositionsState: "stale" }).detail, "Stale");
    assert.equal(ttcLive({ streetcarPositionsState: "disabled" }).detail, "Source Off");
    assert.equal(ttcLive({ vehiclePositions: false, streetcarPositionsState: "disabled" }).detail, "Streetcars");
    assert.equal(ttcLive({ buses: false }).title, "Live Vehicles");
    assert.match(ttcLive({ buses: true }).title, /^Live Vehicles \(buses from zoom \d+\)$/);

    const goLive = (overrides) => pick(mapLayerSwitchRows("regional", "deck", state(overrides), handlers()), "goBusPositions");
    assert.equal(goLive({ goBuses: true }).detail, "GO Buses");
    assert.equal(goLive({ goBuses: true, goBusPositionsState: "stale" }).detail, "Stale");
    assert.equal(goLive({ goBuses: false }).title, "Live GO Buses (with GO Buses on)");
    assert.match(goLive({ goBuses: true }).title, /^Live GO Buses \(from zoom \d+\)$/);
  });

  it("carries the train markers switch's disabled and pending states", () => {
    const row = pick(
      mapLayerSwitchRows("ttc", "deck", state({ trainMarkers: { ...trainMarkers, disabled: true, pending: true, status: "Closed" } }), handlers()),
      "trainMarkers",
    );
    assert.equal(row.disabled, true);
    assert.equal(row.pending, true);
    assert.equal(row.detail, "Closed");
  });

  it("marks the Layers button only when a listed switch is off its default", () => {
    const untouched = (overrides = {}) => state({ trainMarkers: { ...trainMarkers, checked: false }, ...overrides });
    const differs = (network, rowState) => mapLayersDifferFromDefaults(mapLayerSwitchRows(network, "sheet", rowState, handlers()));
    for (const network of ["ttc", "regional"]) {
      assert.equal(differs(network, untouched()), false);
      assert.equal(differs(network, state()), true, "Train Markers count on both networks");
    }
    assert.equal(differs("ttc", untouched({ streetcarRoutes: false })), true);
    assert.equal(differs("ttc", untouched({ buses: true })), true);
    assert.equal(differs("ttc", untouched({ vehiclePositions: false })), true);
    assert.equal(differs("regional", untouched({ goBuses: true })), true);
    assert.equal(differs("regional", untouched({ goBusPositions: false })), true);
    // A switch the network does not list cannot mark its button.
    assert.equal(differs("ttc", untouched({ goBuses: true, goBusPositions: false })), false);
    assert.equal(differs("regional", untouched({ buses: true, streetcarRoutes: false, vehiclePositions: false })), false);
  });
});
