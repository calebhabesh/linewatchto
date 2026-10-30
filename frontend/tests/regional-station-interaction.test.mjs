import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  applyRegionalStationSelection,
  installRegionalStationLabelHover,
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

function fakeRoot(elements) {
  const matching = (selector) => {
    const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    return elements.filter((element) => (
      attribute[2] === undefined
        ? element.attributes.has(attribute[1])
        : element.attributes.get(attribute[1]) === attribute[2]
    ));
  };
  return {
    querySelectorAll: (selector) => matching(selector),
    querySelector: (selector) => matching(selector)[0] ?? null,
  };
}

const originalGlobals = { CSS: globalThis.CSS, Element: globalThis.Element, window: globalThis.window };
beforeEach(() => {
  globalThis.CSS = { escape: (value) => value };
  globalThis.Element = FakeElement;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
});
afterEach(() => Object.assign(globalThis, originalGlobals));

describe("GO/UP station selection", () => {
  it("marks only the selected station's target and indicator, with its intro state", () => {
    const unionTarget = new FakeElement({ "data-regional-station-id": "union" });
    const unionIndicator = new FakeElement({ "data-regional-station-selection-id": "union" });
    const bloorTarget = new FakeElement({ "data-regional-station-id": "bloor" });
    const bloorIndicator = new FakeElement({ "data-regional-station-selection-id": "bloor" });
    const root = fakeRoot([unionTarget, unionIndicator, bloorTarget, bloorIndicator]);

    applyRegionalStationSelection(root, "union", false);
    assert.equal(unionTarget.attributes.get("data-regional-station-selected"), "true");
    assert.equal(unionIndicator.attributes.get("data-regional-station-selected"), "true");
    assert.equal(unionIndicator.classes.has("selection-intro-complete"), false);

    applyRegionalStationSelection(root, "union", true);
    assert.equal(unionIndicator.classes.has("selection-intro-complete"), true);

    applyRegionalStationSelection(root, "bloor", false);
    assert.equal(unionTarget.attributes.has("data-regional-station-selected"), false);
    assert.equal(unionIndicator.classes.has("selection-intro-complete"), false);
    assert.equal(bloorIndicator.attributes.get("data-regional-station-selected"), "true");

    applyRegionalStationSelection(root, null, false);
    assert.equal(bloorIndicator.attributes.has("data-regional-station-selected"), false);
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
