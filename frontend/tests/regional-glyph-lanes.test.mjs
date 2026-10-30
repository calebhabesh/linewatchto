import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  regionalChevronGlyphLane,
  regionalDelayGlyphLane,
  regionalPlannedClosureIconLane,
  regionalSuspensionGlyphLane,
} from "../src/app/regional-map-overlays.ts";

// Just enough SVG DOM for building glyph lanes.
function fakeElement(tagName) {
  const attributes = new Map();
  const element = {
    tagName,
    dataset: {},
    children: [],
    parentElement: null,
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    append: (...nodes) => {
      for (const node of nodes) {
        node.parentElement = element;
        element.children.push(node);
      }
    },
    remove: () => {
      const siblings = element.parentElement?.children;
      if (siblings) siblings.splice(siblings.indexOf(element), 1);
      element.parentElement = null;
    },
    querySelectorAll: (selector) => {
      assert.equal(selector, "[data-resting-transform]");
      const found = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (child.dataset.restingTransform) found.push(child);
          walk(child);
        }
      };
      walk(element);
      return found;
    },
  };
  return element;
}

const documentNode = { createElementNS: (_namespace, tagName) => fakeElement(tagName) };
const sourcePath = {
  getTotalLength: () => 400,
  getPointAtLength: (distance) => ({ x: distance, y: 0 }),
  getAttribute: (name) => (name === "d" ? "M0 0H400" : null),
};
const motionOf = (glyph) => glyph.children.find((child) => child.tagName === "animateMotion");

// Alert overlays never animate on either map (docs/map-renderer-parity.md).
describe("regional glyph lanes", () => {
  for (const [name, build] of [
    ["delay", regionalDelayGlyphLane],
    ["suspension", regionalSuspensionGlyphLane],
    ["reduced speed zone", regionalChevronGlyphLane],
    ["planned closure", regionalPlannedClosureIconLane],
  ]) {
    it(`places ${name} glyphs at rest along a one-way lane`, () => {
      const lane = build(documentNode, sourcePath, "forward");
      assert.ok(lane.children.length > 0);
      assert.ok(lane.children.every((glyph) => !motionOf(glyph)), "no glyph moves");
      assert.ok(lane.children.every((glyph) => /^translate\(/.test(glyph.getAttribute("transform") ?? "")));
    });
  }

  it("spaces glyphs along the lane and flips them for reverse travel", () => {
    const forward = regionalChevronGlyphLane(documentNode, sourcePath, "forward");
    const reverse = regionalChevronGlyphLane(documentNode, sourcePath, "reverse");
    const xs = forward.children.map((glyph) => Number(/translate\(([-\d.]+)/.exec(glyph.getAttribute("transform"))[1]));
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b), "forward glyphs run along the lane");
    assert.match(forward.children[0].getAttribute("transform"), /rotate\(0\)/);
    assert.match(reverse.children[0].getAttribute("transform"), /rotate\(180\)/);
  });
});
