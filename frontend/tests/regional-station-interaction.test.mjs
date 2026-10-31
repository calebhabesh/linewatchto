import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  installRegionalStationLabelHover,
  regionalStationLabelTargets,
} from "../src/app/regional-station-interaction.ts";

// Just enough DOM: elements with data attributes, classes and `closest`.
class FakeElement {
  constructor(attributes = {}, parent = null) {
    this.attributes = new Map(Object.entries(attributes));
    this.classes = new Set();
    this.parent = parent;
    this.classList = {
      remove: (name) => this.classes.delete(name),
      toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name)),
    };
  }
  get dataset() {
    return {
      stationId: this.attributes.get("data-station-id"),
      stationLabelId: this.attributes.get("data-station-label-id"),
    };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    if (selector === "[data-station-id], [data-station-label-id]") {
      return this.attributes.has("data-station-id") || this.attributes.has("data-station-label-id");
    }
    if (selector === ".overlap-indicator") return this.attributes.get("class") === "overlap-indicator";
    return false;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parent?.closest(selector) ?? null;
  }
}

const originalGlobals = { CSS: globalThis.CSS, Element: globalThis.Element, window: globalThis.window };
beforeEach(() => {
  globalThis.CSS = { escape: (value) => value };
  globalThis.Element = FakeElement;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
});
afterEach(() => Object.assign(globalThis, originalGlobals));

const geometry = JSON.parse(readFileSync(new URL("../src/app/map-geometry/regional.json", import.meta.url), "utf8"));

describe("GO/UP station names", () => {
  it("targets every station name over its prepared box", () => {
    const targets = regionalStationLabelTargets(geometry);
    assert.equal(targets.length, geometry.labels.length);
    const union = targets.find((target) => target.stationId === "union");
    assert.equal(union.name, "Union");
    assert.equal(union.points.length, 4);
  });
});

describe("GO/UP station-label hover", () => {
  function setup({ gesture = false } = {}) {
    const listeners = new Map();
    const ownerDocument = {
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type, handler) => {
        if (listeners.get(type) === handler) listeners.delete(type);
      },
    };
    const viewport = { ownerDocument, contains: () => true };
    const hovered = [];
    const dispose = installRegionalStationLabelHover(viewport, {
      onHoverStationId: (id) => hovered.push(id),
      isPointerGestureActive: () => gesture,
    });
    return { listeners, hovered, dispose };
  }
  const station = new FakeElement({ "data-station-id": "union" });
  const name = new FakeElement({ "data-station-label-id": "union" });
  const dot = new FakeElement({}, station);
  const badge = new FakeElement({ class: "overlap-indicator" }, station);

  it("follows the mouse over a station, but not over an overlap badge or other pointers", () => {
    const { listeners, hovered } = setup();
    const move = listeners.get("pointermove");
    move({ pointerType: "mouse", target: dot });
    move({ pointerType: "mouse", target: badge });
    move({ pointerType: "mouse", target: name });
    move({ pointerType: "touch", target: dot });
    assert.deepEqual(hovered, ["union", null, "union"]);
  });

  it("ignores the pointer during a drag or pinch", () => {
    const { listeners, hovered } = setup({ gesture: true });
    listeners.get("pointermove")({ pointerType: "mouse", target: dot });
    assert.deepEqual(hovered, []);
  });

  it("follows keyboard focus between stations and removes its listeners on cleanup", () => {
    const { listeners, hovered, dispose } = setup();
    listeners.get("focusin")({ target: dot });
    listeners.get("focusout")({ target: dot, relatedTarget: null });
    assert.deepEqual(hovered, ["union", null]);
    dispose();
    assert.equal(listeners.size, 0);
  });
});
