import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { mapFocusTargetKey, selectedMapElements } from "../src/app/map-selection-framing.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ttcMapSource = source("../src/components/InteractiveTtcMap.tsx");
const regionalMapSource = source("../src/components/InteractiveRegionalMap.tsx");
const framingSource = source("../src/components/map-camera/useMapFraming.ts");

globalThis.CSS ??= { escape: (value) => String(value) };

/** A root that records the selectors it is asked for and returns one element per selector. */
function recordingRoot() {
  const queries = [];
  return {
    queries,
    querySelectorAll(selector) {
      queries.push(selector);
      return selector.split(", ").map((part) => ({ selector: part }));
    },
    querySelector(selector) {
      queries.push(selector);
      return { selector };
    },
  };
}

const alert = { kind: "delay", id: "delay-1" };
const commute = { id: "commute-1", legId: "leg-2" };

describe("System Map selection framing", () => {
  it("keys framing by what is selected, and frames again when an alert is reselected", () => {
    const state = { selection: alert, selectedStationId: "union", commutePathPreview: commute };
    assert.equal(mapFocusTargetKey(state, 0), "delay:delay-1:0");
    assert.equal(mapFocusTargetKey(state, 1), "delay:delay-1:1");
    assert.equal(mapFocusTargetKey({ ...state, selection: null }, 4), "station:union");
    assert.equal(
      mapFocusTargetKey({ selection: null, selectedStationId: null, commutePathPreview: commute }, 0),
      "commute:commute-1:leg-2",
    );
    assert.equal(mapFocusTargetKey({ selection: null, selectedStationId: null }, 0), null);
  });

  it("frames an alert by its tubes, emphasis and station markers, never its moving glyphs", () => {
    const root = recordingRoot();
    const elements = selectedMapElements(root, { selection: alert, selectedStationId: null });
    assert.deepEqual(elements.map((element) => element.selector), [
      '[data-selected-impact-emphasis="delay-1"]',
      '[data-map-impact-id="delay-1"] > .asset-alert-path',
      '[data-station-impact-selection-id="delay-1"]',
    ]);
  });

  it("adds a commute's highlighted alert copy while a commute preview is open", () => {
    const root = recordingRoot();
    const elements = selectedMapElements(root, {
      selection: alert,
      selectedStationId: null,
      commutePathPreview: commute,
    });
    assert.ok(elements.some((element) => element.selector === '[data-selected-commute-impact-overlay="delay-1"]'));
  });

  it("frames every anchor of a selected station, then a commute route", () => {
    const station = recordingRoot();
    selectedMapElements(station, { selection: null, selectedStationId: "bloor-yonge" });
    assert.deepEqual(station.queries, ['[data-map-selected-station-id="bloor-yonge"]']);

    const route = recordingRoot();
    selectedMapElements(route, { selection: null, selectedStationId: null, commutePathPreview: commute });
    assert.deepEqual(route.queries, ['[data-commute-path-preview="commute-1"]']);
  });

  it("is the only framing code: both maps call it and keep no copy", () => {
    for (const mapSource of [ttcMapSource, regionalMapSource]) {
      assert.match(mapSource, /useDesktopMapInsets\(/);
      assert.match(mapSource, /useMapFraming\(\{/);
      assert.match(mapSource, /mapFocusTargetKey\(/);
      assert.doesNotMatch(mapSource, /focusSelectedMapElements|readOccludedInsets = useCallback|measureDesktopMapInsets/);
      assert.doesNotMatch(mapSource, /lastRecenterSignalRef|lastZoomInSignalRef|lastFocusedTargetKeyRef/);
    }
    assert.match(source("../src/components/RegionalStationLayers.tsx"), /data-map-selected-station-id=\{station\.id\}/);
    assert.match(source("../src/components/TtcStationTarget.tsx"), /data-map-selected-station-id=\{selected \? station\.id : undefined\}/);
  });

  it("frames one way on every map", () => {
    // Selections fit inside the uncovered viewport at one comfort ratio.
    assert.match(framingSource, /export const SELECTION_FIT_COMFORT_RATIO = 0\.82;/);
    assert.match(framingSource, /Math\.min\(stationScale, selectionFit\.scale \* SELECTION_FIT_COMFORT_RATIO\)/);
    // Clearing a selection flies back to the fitted map and counts as untouched.
    assert.match(framingSource, /clearCameraAdjustment\(\);\s*moveToDefaultCamera\(true, false\);/);
    // A gesture defers framing; a phone waits a frame for its inspector.
    assert.match(framingSource, /if \(!ready \|\| isGestureActive\(\)\) return;/);
    assert.match(framingSource, /mobilePerformanceMode \? window\.requestAnimationFrame\(tryFocus\) : null/);
    // Desktop toolbar, legend and sidebar edges are kept clear the same way.
    assert.match(framingSource, /Math\.max\(desktopInsets\.top \+ 16, focusPadding\)/);
    assert.match(framingSource, /Math\.max\(desktopInsets\.bottom, focusPadding, readMobileImpactInspectorInset\(viewport\) \+ focusPadding\)/);
    assert.match(framingSource, /readDesktopLeftOcclusion\(viewport, 24\)/);
    // Toolbar commands are edge-triggered and never replayed on remount.
    assert.match(framingSource, /const lastSignalRef = useRef\(signal\);/);
    assert.match(framingSource, /signal === lastSignalRef\.current/);
  });
});

describe("System Map station names", () => {
  it("are pointer-only targets on both maps; the station target is the keyboard stop", () => {
    const regionalLayers = source("../src/components/RegionalStationLayers.tsx");
    const ttcTargets = source("../src/components/TtcStationTarget.tsx");
    const ttcNameTarget = ttcTargets.slice(ttcTargets.indexOf('key={`station-label-target:'));
    const regionalNameTarget = regionalLayers.slice(regionalLayers.indexOf("export const RegionalStationLabelTargets"));
    for (const target of [ttcNameTarget, regionalNameTarget]) {
      assert.match(target.slice(0, 600), /aria-hidden="true"[\s\S]*focusable="false"/);
      assert.doesNotMatch(target.slice(0, 600), /tabIndex=\{0\}/);
    }
  });
});

