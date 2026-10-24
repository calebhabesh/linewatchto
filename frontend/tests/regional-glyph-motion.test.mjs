import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  regionalChevronGlyphLane,
  regionalPlannedClosureIconLane,
  setRegionalGlyphLaneMotion,
} from "../src/app/regional-map-overlays.ts";

// Just enough SVG DOM for building glyph lanes and toggling their motion.
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

describe("regional glyph lane motion", () => {
  it("pauses and resumes motion in place without replacing glyphs, like TTC", () => {
    const lane = regionalChevronGlyphLane(documentNode, sourcePath, "forward", false);
    const glyphs = [...lane.children];
    assert.ok(glyphs.length > 1);
    const begins = glyphs.map((glyph) => motionOf(glyph)?.getAttribute("begin"));
    assert.ok(begins.every(Boolean), "a one-way lane moves when motion is allowed");
    assert.ok(glyphs.every((glyph) => glyph.getAttribute("transform") === null));

    setRegionalGlyphLaneMotion(documentNode, lane, false);
    assert.deepEqual([...lane.children], glyphs, "pausing keeps the same glyph nodes");
    assert.ok(glyphs.every((glyph) => !motionOf(glyph)));
    assert.ok(glyphs.every((glyph) => glyph.getAttribute("transform") === glyph.dataset.restingTransform));

    setRegionalGlyphLaneMotion(documentNode, lane, true);
    assert.deepEqual([...lane.children], glyphs, "resuming keeps the same glyph nodes");
    assert.deepEqual(glyphs.map((glyph) => motionOf(glyph)?.getAttribute("begin")), begins,
      "resumed glyphs keep their spacing along the lane");
    assert.ok(glyphs.every((glyph) => glyph.getAttribute("transform") === null));
  });

  it("builds a reduced-motion lane at rest and lets it start moving later", () => {
    const lane = regionalChevronGlyphLane(documentNode, sourcePath, "forward", true);
    assert.ok(lane.children.every((glyph) => !motionOf(glyph) && glyph.getAttribute("transform")));
    setRegionalGlyphLaneMotion(documentNode, lane, true);
    assert.ok(lane.children.every((glyph) => motionOf(glyph)));
  });

  it("keeps a directionless planned lane at rest even when motion is allowed", () => {
    const lane = regionalPlannedClosureIconLane(documentNode, sourcePath, "bidirectional", false);
    setRegionalGlyphLaneMotion(documentNode, lane, true);
    assert.ok(lane.children.length > 0);
    assert.ok(lane.children.every((glyph) => !motionOf(glyph) && glyph.getAttribute("transform")));
  });
});
