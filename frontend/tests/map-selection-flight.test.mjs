import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createDeferredSelectionFlight,
  paddingBeyondHeld,
  selectionFlightDuration,
  selectionFlightEasing,
} from "../src/components/map-selection-flight.ts";

function manualFrames() {
  const queue = new Map();
  let next = 1;
  return {
    request: (callback) => {
      queue.set(next, callback);
      return next++;
    },
    cancel: (id) => queue.delete(id),
    step() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback();
    },
    get waiting() {
      return queue.size;
    },
  };
}

describe("selectionFlightDuration", () => {
  it("gives a hop in place time to read as a move, and caps a cross-city one", () => {
    assert.equal(selectionFlightDuration(0, 0), 700);
    assert.equal(selectionFlightDuration(500, 3), 1400);
  });

  it("grows with distance and with zoom change, in either direction", () => {
    assert.ok(selectionFlightDuration(1, 0) > selectionFlightDuration(0.2, 0));
    assert.ok(selectionFlightDuration(0.2, 2) > selectionFlightDuration(0.2, 0));
    assert.equal(selectionFlightDuration(0.2, -2), selectionFlightDuration(0.2, 2));
  });
});

describe("selectionFlightEasing", () => {
  it("starts and stops at rest and reaches the end", () => {
    assert.equal(selectionFlightEasing(0), 0);
    assert.equal(selectionFlightEasing(1), 1);
    assert.equal(selectionFlightEasing(0.5), 0.5);
    assert.ok(selectionFlightEasing(0.02) < 0.002);
  });
});

describe("paddingBeyondHeld", () => {
  it("asks only for what the camera's held padding does not cover, never below zero", () => {
    assert.deepEqual(
      paddingBeyondHeld({ top: 100, bottom: 200, left: 72, right: 72 }, { top: 60, bottom: 400, left: 0, right: 0 }),
      { top: 40, bottom: 0, left: 72, right: 72 },
    );
  });
});

describe("createDeferredSelectionFlight", () => {
  it("starts on the second frame and is pending through the start", () => {
    const frames = manualFrames();
    const flight = createDeferredSelectionFlight(frames);
    const pendingDuringStart = [];
    flight.schedule("surface", () => pendingDuringStart.push(flight.pending));
    assert.equal(flight.pending, true);
    frames.step();
    assert.deepEqual(pendingDuringStart, []);
    frames.step();
    assert.deepEqual(pendingDuringStart, [true]);
    assert.equal(flight.pending, false);
  });

  it("flies once when a commit frames twice: the later replaces the earlier", () => {
    const frames = manualFrames();
    const flight = createDeferredSelectionFlight(frames);
    const started = [];
    flight.schedule("rail", () => started.push("first"));
    flight.schedule("rail", () => started.push("second"));
    frames.step();
    flight.schedule("surface", () => started.push("third"));
    frames.step();
    frames.step();
    assert.deepEqual(started, ["third"]);
    assert.equal(frames.waiting, 0);
  });

  it("clearing one owner's selection leaves another's flight alone", () => {
    const frames = manualFrames();
    const flight = createDeferredSelectionFlight(frames);
    const started = [];
    flight.schedule("rail", () => started.push("rail"));
    flight.cancel("surface");
    assert.equal(flight.pending, true);
    flight.cancel("rail");
    assert.equal(flight.pending, false);
    frames.step();
    frames.step();
    assert.deepEqual(started, []);
  });

  it("stops pending if the start throws", () => {
    const frames = manualFrames();
    const flight = createDeferredSelectionFlight(frames);
    flight.schedule("station", () => { throw new Error("map gone"); });
    frames.step();
    assert.throws(() => frames.step(), /map gone/);
    assert.equal(flight.pending, false);
  });
});
