import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REGIONAL_DYNAMIC_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_COMMUTE_LAYER_ID,
  REGIONAL_DYNAMIC_HOVER_LAYER_ID,
  REGIONAL_TOP_HOVER_LAYER_ID,
  regionalImpactPriority,
  regionalOverlayRuns,
  regionalOverlapChooserLayout,
  installRegionalOverlaySession,
  regionalOverlayContentSignature,
  keepUnchangedRegionalOverlays,
  placeRegionalOverlayChildren,
} from "../src/app/regional-map-overlays.ts";

function createMockElement(tagName, id = "", classes = []) {
  const classListSet = new Set(classes);
  const attributes = new Map();
  const children = [];
  const listeners = new Map();

  const element = {
    tagName: tagName.toUpperCase(),
    nodeName: tagName.toUpperCase(),
    id,
    classList: {
      add: (...tokens) => tokens.forEach((t) => classListSet.add(t)),
      remove: (...tokens) => tokens.forEach((t) => classListSet.delete(t)),
      contains: (token) => classListSet.has(token),
    },
    dataset: {},
    style: {
      setProperty: (k, v) => { element.style[k] = v; },
      removeProperty: (k) => { delete element.style[k]; },
    },
    children,
    childNodes: children,
    parentElement: null,
    firstChild: null,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, val) => attributes.set(name, String(val)),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent: (event) => {
      const list = listeners.get(event.type) ?? [];
      for (const h of list) h(event);
      return true;
    },
    append: (...nodes) => {
      for (const node of nodes) {
        node.parentElement = element;
        children.push(node);
      }
      element.firstChild = children[0] ?? null;
    },
    replaceChildren: (...nodes) => {
      for (const child of children) {
        child.parentElement = null;
      }
      children.length = 0;
      for (const node of nodes) {
        node.parentElement = element;
        children.push(node);
      }
      element.firstChild = children[0] ?? null;
    },
    contains: (target) => {
      if (target === element) return true;
      for (const child of children) {
        if (child.contains?.(target)) return true;
      }
      return false;
    },
    querySelector: (selector) => {
      return element.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll: (selector) => {
      const matches = [];
      const visit = (node) => {
        if (node !== element) {
          if (selector.startsWith("#") && node.id === selector.slice(1)) {
            matches.push(node);
          } else if (selector.startsWith(".") && node.classList.contains(selector.slice(1))) {
            matches.push(node);
          } else if (selector === "svg" && node.tagName === "SVG") {
            matches.push(node);
          } else if (selector.includes("[data-regional-impact-selected]") && node.hasAttribute("data-regional-impact-selected")) {
            matches.push(node);
          } else if (selector.includes("[data-selected-commute-impact-overlay]") && node.hasAttribute("data-selected-commute-impact-overlay")) {
            matches.push(node);
          } else if (selector.includes("[data-regional-station-id]") && node.dataset?.regionalStationId) {
            matches.push(node);
          } else if (selector.includes('aria-label="GO and UP regional rail schematic"') && node.getAttribute("aria-label") === "GO and UP regional rail schematic") {
            matches.push(node);
          }
        }
        for (const child of node.children ?? []) {
          visit(child);
        }
      };
      visit(element);
      return matches;
    },
    closest: (selector) => {
      let current = element;
      while (current) {
        if (selector.startsWith(".") && current.classList?.contains(selector.slice(1))) return current;
        if (selector.startsWith("#") && current.id === selector.slice(1)) return current;
        if (selector.includes("[data-regional-station-id]") && current.dataset?.regionalStationId) return current;
        current = current.parentElement;
      }
      return null;
    },
  };

  return element;
}

describe("regional map overlays lifecycle and utilities", () => {
  describe("dynamic layer constants", () => {
    it("exports all dynamic layer IDs per contract", () => {
      assert.equal(REGIONAL_DYNAMIC_SEGMENT_LAYER_ID, "regional-dynamic-segment-layer");
      assert.equal(REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID, "regional-dynamic-selected-segment-layer");
      assert.equal(REGIONAL_DYNAMIC_COMMUTE_LAYER_ID, "regional-dynamic-commute-layer");
      assert.equal(REGIONAL_DYNAMIC_HOVER_LAYER_ID, "regional-dynamic-hover-layer");
      assert.equal(REGIONAL_TOP_HOVER_LAYER_ID, "regional-top-hover-layer");
    });
  });

  describe("regionalImpactPriority", () => {
    it("orders disruption kinds by ascending severity", () => {
      assert.equal(regionalImpactPriority("reduced-speed-zone"), 1);
      assert.equal(regionalImpactPriority("planned-closure"), 0);
      assert.equal(regionalImpactPriority("delay"), 2);
      assert.equal(regionalImpactPriority("suspension"), 3);
      assert.equal(regionalImpactPriority("unknown-kind"), -1);

      const kinds = ["suspension", "reduced-speed-zone", "delay", "planned-closure"];
      const sorted = [...kinds].sort((a, b) => regionalImpactPriority(a) - regionalImpactPriority(b));
      assert.deepEqual(sorted, ["planned-closure", "reduced-speed-zone", "delay", "suspension"]);
    });
  });

  describe("regionalOverlayRuns", () => {
    it("returns an empty array when given no pieces", () => {
      assert.deepEqual(regionalOverlayRuns([]), []);
    });

    it("creates a single run for a single piece", () => {
      const piece = {
        pieceId: "piece-1",
        lineId: "regional-lw",
        impact: { kind: "delay", cardId: "card-lw-1" },
        segment: {
          id: "seg-1",
          stationAId: "union",
          stationBId: "exhibition",
          lineId: "regional-lw",
        },
        pathD: "M 0 0 L 10 10",
        layerIndex: 0,
      };

      const runs = regionalOverlayRuns([piece]);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].lineId, "regional-lw");
      assert.equal(runs[0].impact.cardId, "card-lw-1");
      assert.equal(runs[0].segments.length, 1);
      assert.equal(runs[0].pathD, "M 0 0 L 10 10");
    });

    it("merges adjacent segments sharing the same impact into a single run", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-2", stationAId: "exhibition", stationBId: "mimico", lineId: "regional-lw" },
          pathD: "M 10 10 L 20 20",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].segments.length, 2);
      assert.equal(runs[0].pathD, "M 0 0 L 10 10 M 10 10 L 20 20");
    });

    it("keeps non-adjacent segments as separate runs", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-3", stationAId: "clarkson", stationBId: "oakville", lineId: "regional-lw" },
          pathD: "M 50 50 L 60 60",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 2);
      assert.equal(runs[0].segments.length, 1);
      assert.equal(runs[1].segments.length, 1);
    });

    it("keeps different impact cards as separate runs even if adjacent", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "suspension", cardId: "card-2" },
          segment: { id: "seg-2", stationAId: "exhibition", stationBId: "mimico", lineId: "regional-lw" },
          pathD: "M 10 10 L 20 20",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 2);
      assert.equal(runs[0].impact.kind, "delay");
      assert.equal(runs[1].impact.kind, "suspension");
    });
  });

  describe("regionalOverlapChooserLayout", () => {
    it("calculates layout position avoiding collisions", () => {
      const markerCenter = { x: 500, y: 500 };
      const markerSize = { width: 44, height: 44 };
      const alertAnchor = { x: 500, y: 520 };
      const chooserSize = { width: 120, height: 80 };
      const viewportSize = { width: 1000, height: 1000 };
      const uiKeepoutBoxes = [
        { x: 0, y: 0, width: 200, height: 200 },
      ];
      const alertCollisionBoxes = [];

      const result = regionalOverlapChooserLayout({
        markerCenter,
        markerSize,
        alertAnchor,
        chooserSize,
        viewportSize,
        alertCollisionBoxes,
        uiKeepoutBoxes,
      });

      assert.ok(result, "must return a layout result");
      assert.ok(result.layout, "must contain layout");
      assert.ok(typeof result.layout.left === "number");
      assert.ok(typeof result.layout.top === "number");
      assert.ok(typeof result.layout.anchorOffsetX === "number");
      assert.ok(typeof result.layout.anchorOffsetY === "number");
      assert.ok(result.size.width > 0);
      assert.ok(result.size.height > 0);
    });
  });

  describe("installRegionalOverlaySession lifecycle", () => {
    it("returns null when SVG element is missing", () => {
      const viewport = createMockElement("div");
      const session = installRegionalOverlaySession(viewport);
      assert.equal(session, null);
    });

    it("successfully installs, manages listeners, and cleans up on dispose", () => {
      const docListeners = new Map();
      const originalDocument = globalThis.document;
      const originalWindow = globalThis.window;
      const originalCSS = globalThis.CSS;

      globalThis.CSS = { escape: (s) => s };
      globalThis.document = {
        addEventListener: (type, handler) => {
          if (!docListeners.has(type)) docListeners.set(type, []);
          docListeners.get(type).push(handler);
        },
        removeEventListener: (type, handler) => {
          const list = docListeners.get(type) ?? [];
          const idx = list.indexOf(handler);
          if (idx >= 0) list.splice(idx, 1);
        },
        createElementNS: (_ns, tag) => createMockElement(tag),
      };

      let animationFramesCancelled = 0;
      globalThis.window = {
        cancelAnimationFrame: () => { animationFramesCancelled++; },
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
      };

      try {
        const viewport = createMockElement("div");
        const svg = createMockElement("svg");
        svg.setAttribute("aria-label", "GO and UP regional rail schematic");

        const segmentLayer = createMockElement("g", REGIONAL_DYNAMIC_SEGMENT_LAYER_ID);
        const selectedSegmentLayer = createMockElement("g", REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID);
        const commuteLayer = createMockElement("g", REGIONAL_DYNAMIC_COMMUTE_LAYER_ID);
        const hoverLayer = createMockElement("g", REGIONAL_DYNAMIC_HOVER_LAYER_ID);
        const topHoverLayer = createMockElement("g", REGIONAL_TOP_HOVER_LAYER_ID);

        svg.append(
          segmentLayer,
          selectedSegmentLayer,
          commuteLayer,
          hoverLayer,
        );
        viewport.append(svg, topHoverLayer);

        let hoveredStation = null;
        let hoveredImpact = null;
        const session = installRegionalOverlaySession(viewport, {
          onHoverStationId: (id) => { hoveredStation = id; },
          onHoverImpact: (impact) => { hoveredImpact = impact; },
          isPointerGestureActive: () => false,
        });

        assert.ok(session, "session must be installed");
        assert.ok(typeof session.update === "function");
        assert.ok(typeof session.updateSelection === "function");
        assert.ok(typeof session.updateStationSelection === "function");
        assert.ok(typeof session.dispose === "function");

        // Verify event listeners were registered on document
        assert.ok(docListeners.get("pointermove")?.length === 1);
        assert.ok(docListeners.get("focusin")?.length === 1);
        assert.ok(docListeners.get("focusout")?.length === 1);

        // Update selection
        session.updateSelection({ kind: "delay", id: "alert-123" });
        session.updateStationSelection("union");

        // Dispose session
        session.dispose();

        // Verify event listeners were removed from document
        assert.equal(docListeners.get("pointermove")?.length, 0);
        assert.equal(docListeners.get("focusin")?.length, 0);
        assert.equal(docListeners.get("focusout")?.length, 0);
        assert.equal(hoveredStation, null);
        assert.equal(hoveredImpact, null);
        assert.equal(animationFramesCancelled, 0);
      } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
        globalThis.CSS = originalCSS;
      }
    });
  });
});

describe("regionalOverlayContentSignature", () => {
  const snapshot = (updatedAt, closureTitle = "Weekend service adjustments") => ({
    activeAlerts: [{ id: "alert-1", severity: "delay", lineId: "regional-lw", affectedSegmentIds: [], updatedAt }],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [{ id: "closure-1", lineId: "regional-lw", title: closureTitle, previewSegmentIds: [], previewStationIds: ["oakville"], updatedAt }],
    networkSegments: [{ id: "segment-lw-a-b", lineId: "regional-lw", impacts: [] }],
    stationNodeImpacts: [],
    stations: [{ id: "oakville", name: "Oakville" }],
    commutePathPreview: null,
  });

  it("keeps overlays in place when a poll only returns fresh copies with new run timestamps", () => {
    assert.equal(
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z")),
      regionalOverlayContentSignature(snapshot("2026-10-23T21:07:37Z")),
    );
  });

  it("rebuilds overlays when drawn content changes", () => {
    assert.notEqual(
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z")),
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z", "Line closed")),
    );
  });
});

describe("per-alert overlay reconciliation", () => {
  // Just enough DOM for the reconciler. `remounts` counts how often a node
  // that was already mounted is moved, which restarts its CSS animations.
  class Node {
    constructor(tag, attributes = {}) {
      this.tag = tag;
      this.attributes = new Map(Object.entries(attributes));
      this.parent = null;
      this.kids = [];
      this.remounts = 0;
    }
    get children() { return [...this.kids]; }
    get firstElementChild() { return this.kids[0] ?? null; }
    get nextElementSibling() {
      const siblings = this.parent?.kids ?? [];
      return siblings[siblings.indexOf(this) + 1] ?? null;
    }
    get outerHTML() {
      const attributes = [...this.attributes].sort().map(([name, value]) => ` ${name}="${value}"`).join("");
      return `<${this.tag}${attributes}>${this.kids.map((kid) => kid.outerHTML).join("")}</${this.tag}>`;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    remove() {
      if (!this.parent) return;
      this.parent.kids.splice(this.parent.kids.indexOf(this), 1);
      this.parent = null;
    }
    insertBefore(node, reference) {
      if (node.parent) node.remounts += 1;
      node.remove();
      const index = reference ? this.kids.indexOf(reference) : this.kids.length;
      this.kids.splice(index, 0, node);
      node.parent = this;
    }
  }
  const alert = (id, kind = "delay") => new Node("g", { "data-map-impact-id": id, "data-map-impact-kind": kind });
  const reconcile = (layer, built) => {
    const next = keepUnchangedRegionalOverlays(layer.children, built);
    placeRegionalOverlayChildren(layer, next);
    return next;
  };

  it("keeps unchanged alerts mounted when another alert is added, changed, or removed", () => {
    const layer = new Node("g");
    const [a, b, c] = reconcile(layer, [alert("a"), alert("b"), alert("c")]);
    // A poll-built copy of the same drawing, plus a new alert at the front.
    const afterAdd = reconcile(layer, [alert("new"), alert("a"), alert("b"), alert("c")]);
    assert.deepEqual(afterAdd.slice(1), [a, b, c]);
    assert.equal(layer.kids.length, 4);

    // b changes kind, so only b is replaced.
    const afterChange = reconcile(layer, [alert("new"), alert("a"), alert("b", "suspension"), alert("c")]);
    assert.equal(afterChange[1], a);
    assert.notEqual(afterChange[2], b);
    assert.equal(afterChange[3], c);
    assert.equal(b.parent, null);

    // Removing a leaves the rest in place.
    const afterRemove = reconcile(layer, [alert("new"), alert("b", "suspension"), alert("c")]);
    assert.deepEqual(afterRemove, [afterChange[0], afterChange[2], c]);
    assert.equal(a.parent, null);
    for (const node of [a, b, c]) assert.equal(node.remounts, 0, "unchanged alerts never move");
  });

  it("compares the drawing as built, ignoring selection and hover state applied in place", () => {
    const layer = new Node("g");
    const [selected] = reconcile(layer, [alert("a"), alert("b")]);
    selected.setAttribute("data-regional-impact-selected", "true");
    const next = reconcile(layer, [alert("a"), alert("b")]);
    assert.equal(next[0], selected);
    assert.equal(selected.attributes.get("data-regional-impact-selected"), "true");
  });

  it("pairs identical drawings one to one and drops nodes it did not build", () => {
    const layer = new Node("g");
    const stray = new Node("g", { class: "regional-impact-preview-outline" });
    layer.insertBefore(stray, null);
    const [first, second] = reconcile(layer, [alert("a"), alert("a")]);
    assert.notEqual(first, second);
    assert.equal(stray.parent, null);
    const next = reconcile(layer, [alert("a"), alert("a"), alert("a")]);
    assert.deepEqual(next.slice(0, 2), [first, second]);
    assert.equal(layer.kids.length, 3);
  });
});
