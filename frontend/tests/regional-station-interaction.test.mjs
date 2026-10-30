import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  installRegionalStationLabelHover,
  regionalStationArtwork,
  regionalStationHoverShapes,
  regionalStationLabelTargets,
  regionalStationSelectionShapes,
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
    return { regionalStationId: this.attributes.get("data-regional-station-id") };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    if (selector === "[data-regional-station-id]") return this.attributes.has("data-regional-station-id");
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

describe("GO/UP station artwork", () => {
  const artwork = regionalStationArtwork(geometry);
  const station = (id) => artwork.find((candidate) => candidate.id === id);

  it("reads each station's shapes from the prepared map, keeping a junction's authored transforms", () => {
    // A junction's own dots are part of its group, never stations of their own.
    assert.equal(artwork.length, geometry.labels.length);
    assert.ok(!artwork.some((candidate) => /-(?:ki|up)$/.test(candidate.id)));
    const pickering = station("pickering");
    assert.equal(pickering.large, false);
    assert.match(pickering.transform, /^matrix\(1 0 0 1 /);
    assert.deepEqual(pickering.shapes.map((shape) => shape.tag), ["circle"]);
    assert.equal(station("union").large, true);
    // Bloor's group is rotated; its connector bars keep their own rotation.
    const bloor = station("bloor");
    assert.doesNotMatch(bloor.transform, /^matrix\(1 0 0 1 /);
    assert.deepEqual(bloor.shapes.map((shape) => [shape.tag, Boolean(shape.transform), Boolean(shape.join)]), [
      ["rect", true, true],
      ["rect", true, true],
      ["circle", false, false],
      ["ellipse", false, false],
    ]);
  });

  it("grows hover rings and selection markers from the dots, without junction bars", () => {
    const pickering = station("pickering");
    const union = station("union");
    const bloor = station("bloor");
    const [dot] = pickering.shapes;
    assert.equal(regionalStationHoverShapes(pickering)[0].r, dot.r * 1.45);
    assert.equal(regionalStationSelectionShapes(pickering)[0].r, dot.r * 1.2);
    // Union's pill keeps a fixed 75-unit hover pad and its authored size when selected.
    const [pill] = union.shapes;
    const hover = regionalStationHoverShapes(union)[0];
    assert.deepEqual([hover.x, hover.y, hover.width, hover.height, hover.rx], [
      pill.x - 75, pill.y - 75, pill.width + 150, pill.height + 150, pill.rx + 75,
    ]);
    assert.deepEqual(regionalStationSelectionShapes(union)[0], pill);
    assert.deepEqual(regionalStationHoverShapes(bloor).map((shape) => shape.tag), ["circle", "ellipse"]);
    assert.deepEqual(regionalStationSelectionShapes(bloor).map((shape) => shape.tag), ["circle", "ellipse"]);
  });

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
  const station = new FakeElement({ "data-regional-station-id": "union" });
  const dot = new FakeElement({}, station);
  const badge = new FakeElement({ class: "overlap-indicator" }, station);

  it("follows the mouse over a station, but not over an overlap badge or other pointers", () => {
    const { listeners, hovered } = setup();
    const move = listeners.get("pointermove");
    move({ pointerType: "mouse", target: dot });
    move({ pointerType: "mouse", target: badge });
    move({ pointerType: "touch", target: dot });
    assert.deepEqual(hovered, ["union", null]);
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
