import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createExpression, featureFilter } from "@maplibre/maplibre-gl-style-spec";

import {
  EMPTY_GEOJSON_FEATURE_COLLECTION,
  ensureBadgeImages,
  lineBadgeOpacityExpression,
  lineBreadcrumbOpacityExpression,
  lineBreadcrumbSpriteExpression,
  updateGeographicDynamicSources,
  updateGeographicLineFilter,
  updateGeographicStationSelection,
  updateGeographicStationHover,
  createGeographicStationHoverAnimator,
  GEOGRAPHIC_STATION_HOVER_EASE_MS,
  updateGeographicImpactSelection,
  updateGeographicSelectionStyling,
  applyGeographicDynamicState,
  applyDynamicDataAndFilters,
  installTransitLayers,
} from "../src/components/geographic-map-operations.ts";
import { getGeographicMapLifecycle } from "../src/app/geographic-lifecycle.ts";

function evaluateOpacity(expression, properties = {}, networkOpacity = 1) {
  const compiled = createExpression(expression, "paint.opacity");
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluateWithoutErrorHandling(
    { zoom: 13, globalState: { "linewatch-network-opacity": networkOpacity } },
    { properties },
  );
}

describe("Geographic map operations", () => {
  // Polyfill window for node environment
  globalThis.window = globalThis;

  it("exports an empty GeoJSON FeatureCollection constant", () => {
    assert.deepEqual(EMPTY_GEOJSON_FEATURE_COLLECTION, {
      type: "FeatureCollection",
      features: [],
    });
  });

  describe("lineBadgeOpacityExpression", () => {
    it("returns base zoom interpolation when activeLine is null", () => {
      const expr = lineBadgeOpacityExpression(null);
      assert.equal(expr[0], "interpolate");
      assert.deepEqual(expr[1], ["linear"]);
      assert.deepEqual(expr[2], ["zoom"]);
    });

    it("returns active line opacity weighting expression when activeLine is set", () => {
      const expr = lineBadgeOpacityExpression("1");
      assert.equal(expr[0], "*");
      assert.equal(expr[1][0], "interpolate");
      assert.deepEqual(expr[2], ["case", ["==", ["get", "lineId"], "1"], 1, 0.2]);
    });
  });

  describe("ensureBadgeImages", () => {
    it("safely handles empty or missing badge keys", () => {
      let addImageCalled = false;
      const mockMap = {
        hasImage: () => false,
        addImage: () => {
          addImageCalled = true;
        },
      };

      ensureBadgeImages(mockMap, [
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} },
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { badgeImageKey: "" } },
      ]);

      assert.equal(addImageCalled, false);
    });

    it("skips images that the map already has", () => {
      let addImageCalled = false;
      const mockMap = {
        hasImage: (key) => key === "overlap-2-suspension",
        addImage: () => {
          addImageCalled = true;
        },
      };

      ensureBadgeImages(mockMap, [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { badgeImageKey: "overlap-2-suspension" },
        },
      ]);

      assert.equal(addImageCalled, false);
    });
  });

  describe("updateGeographicDynamicSources", () => {
    it("updates all 7 dynamic sources in-place via setData and records lifecycle update", () => {
      const stats = getGeographicMapLifecycle();
      stats.reset();

      const setDataCalls = [];
      const createMockSource = (name) => ({
        setData: (data) => setDataCalls.push({ name, data }),
      });

      const sources = {
        "transit-impacts": createMockSource("transit-impacts"),
        "transit-impact-stations": createMockSource("transit-impact-stations"),
        "transit-impact-badges": createMockSource("transit-impact-badges"),
        "transit-impact-arrows": createMockSource("transit-impact-arrows"),
        "transit-train-markers": createMockSource("transit-train-markers"),
        "transit-commute-links": createMockSource("transit-commute-links"),
        "transit-commute-stations": createMockSource("transit-commute-stations"),
      };

      const mockMap = {
        getSource: (id) => sources[id],
        hasImage: () => true,
      };

      const overlayData = {
        impactedLinks: { type: "FeatureCollection", features: [{ id: "l1" }] },
        impactedStations: { type: "FeatureCollection", features: [{ id: "s1" }] },
        impactBadges: { type: "FeatureCollection", features: [] },
        impactArrows: { type: "FeatureCollection", features: [{ id: "a1" }] },
        trainMarkers: { type: "FeatureCollection", features: [{ id: "t1" }] },
        commuteLinks: { type: "FeatureCollection", features: [{ id: "c1" }] },
        commuteStations: { type: "FeatureCollection", features: [{ id: "cs1" }] },
      };

      updateGeographicDynamicSources(mockMap, overlayData);

      assert.equal(stats.sourceUpdates, 1);
      assert.equal(stats.events.at(-1)?.type, "sourceUpdate");
      assert.equal(setDataCalls.length, 7);
      assert.equal(setDataCalls.find((c) => c.name === "transit-impacts")?.data, overlayData.impactedLinks);
      assert.equal(setDataCalls.find((c) => c.name === "transit-impact-stations")?.data, overlayData.impactedStations);
      assert.equal(setDataCalls.find((c) => c.name === "transit-impact-badges")?.data, overlayData.impactBadges);
      assert.equal(setDataCalls.find((c) => c.name === "transit-impact-arrows")?.data, overlayData.impactArrows);
      assert.equal(setDataCalls.find((c) => c.name === "transit-train-markers")?.data, overlayData.trainMarkers);
      assert.equal(setDataCalls.find((c) => c.name === "transit-commute-links")?.data, overlayData.commuteLinks);
      assert.equal(setDataCalls.find((c) => c.name === "transit-commute-stations")?.data, overlayData.commuteStations);
    });

    it("handles missing sources gracefully without throwing", () => {
      const mockMap = {
        getSource: () => undefined,
        hasImage: () => true,
      };

      const overlayData = {
        impactedLinks: EMPTY_GEOJSON_FEATURE_COLLECTION,
        impactedStations: EMPTY_GEOJSON_FEATURE_COLLECTION,
        impactBadges: EMPTY_GEOJSON_FEATURE_COLLECTION,
        impactArrows: EMPTY_GEOJSON_FEATURE_COLLECTION,
        trainMarkers: EMPTY_GEOJSON_FEATURE_COLLECTION,
        commuteLinks: EMPTY_GEOJSON_FEATURE_COLLECTION,
        commuteStations: EMPTY_GEOJSON_FEATURE_COLLECTION,
      };

      assert.doesNotThrow(() => {
        updateGeographicDynamicSources(mockMap, overlayData);
      });
    });
  });

  describe("updateGeographicLineFilter", () => {
    it("sets selective opacity expressions across transit and train layers when active line is filtered", () => {
      const paintCalls = [];
      const layerIds = [
        "transit-routes",
        "transit-line-badges",
        "transit-stations-outer",
        "transit-stations-inner",
        "transit-impact-arrows",
        "transit-impact-arrows-casing",
        "transit-train-markers-halo",
        "transit-train-markers-symbol",
        "transit-train-markers-label",
      ];

      const mockMap = {
        getLayer: (id) => layerIds.includes(id),
        setPaintProperty: (layerId, prop, value) => {
          paintCalls.push({ layerId, prop, value });
        },
      };

      updateGeographicLineFilter(mockMap, "line-1");

      // Verify every listed layer was updated
      const updatedLayers = new Set(paintCalls.map((c) => c.layerId));
      for (const id of layerIds) {
        assert.ok(updatedLayers.has(id), `Layer ${id} should be updated on line filter`);
      }

      // The network fade must preserve line filtering throughout the animation.
      const routesCall = paintCalls.find((c) => c.layerId === "transit-routes" && c.prop === "line-opacity");
      assert.equal(evaluateOpacity(routesCall?.value, { lineId: "line-1" }), 1);
      assert.equal(evaluateOpacity(routesCall?.value, { lineId: "line-2" }), 0.2);
      assert.equal(evaluateOpacity(routesCall?.value, { lineId: "line-2" }, 0.5), 0.1);
      assert.equal(evaluateOpacity(routesCall?.value, { lineId: "line-1" }, 0), 0);

      const stationsCall = paintCalls.find((c) => c.layerId === "transit-stations-outer" && c.prop === "circle-opacity");
      assert.equal(evaluateOpacity(stationsCall?.value, { lineIds: ["line-1"] }), 1);
      assert.equal(evaluateOpacity(stationsCall?.value, { lineIds: ["line-2"] }), 0.25);
      assert.equal(evaluateOpacity(stationsCall?.value, { lineIds: ["line-2"] }, 0.5), 0.125);

      // Check line badges icon opacity uses expression
      const badgeCall = paintCalls.find((c) => c.layerId === "transit-line-badges" && c.prop === "icon-opacity");
      assert.ok(Array.isArray(badgeCall?.value));
    });

    it("restores full opacity when line filter is cleared to null", () => {
      const paintCalls = [];
      const layerIds = [
        "transit-routes",
        "transit-line-badges",
        "transit-stations-outer",
        "transit-stations-inner",
        "transit-impact-arrows",
        "transit-impact-arrows-casing",
        "transit-train-markers-halo",
        "transit-train-markers-symbol",
        "transit-train-markers-label",
      ];

      const mockMap = {
        getLayer: (id) => layerIds.includes(id),
        setPaintProperty: (layerId, prop, value) => {
          paintCalls.push({ layerId, prop, value });
        },
      };

      updateGeographicLineFilter(mockMap, null);

      const routesCall = paintCalls.find((c) => c.layerId === "transit-routes" && c.prop === "line-opacity");
      assert.equal(evaluateOpacity(routesCall?.value), 1);
      assert.equal(evaluateOpacity(routesCall?.value, {}, 0.5), 0.5);

      const stationsOuterCall = paintCalls.find((c) => c.layerId === "transit-stations-outer" && c.prop === "circle-opacity");
      assert.equal(evaluateOpacity(stationsOuterCall?.value), 1);

      const casingCall = paintCalls.find((c) => c.layerId === "transit-impact-arrows-casing" && c.prop === "icon-opacity");
      assert.equal(evaluateOpacity(casingCall?.value), 0.98);
    });
  });

  describe("updateGeographicStationSelection", () => {
    it("sets station filter when selectedStationId is provided", () => {
      const filterCalls = [];
      const mockMap = {
        getLayer: (id) => id === "transit-station-selection",
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
      };

      updateGeographicStationSelection(mockMap, "bloor-yonge");
      assert.deepEqual(filterCalls, [
        { id: "transit-station-selection", filter: ["==", ["get", "stationId"], "bloor-yonge"] },
      ]);
    });

    it("clears station filter when selectedStationId is null", () => {
      const filterCalls = [];
      const mockMap = {
        getLayer: (id) => id === "transit-station-selection",
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
      };

      updateGeographicStationSelection(mockMap, null);
      assert.deepEqual(filterCalls, [
        { id: "transit-station-selection", filter: ["==", ["get", "stationId"], ""] },
      ]);
    });
  });

  describe("updateGeographicStationHover", () => {
    const hover = (hoveredStationId, selectedStationId, options) => {
      const filters = {};
      const mockMap = {
        getLayer: (id) => id === "transit-station-hover" || id === "transit-station-labels-hover",
        setFilter: (id, filter) => { filters[id] = filter; },
      };
      updateGeographicStationHover(mockMap, hoveredStationId, selectedStationId, options);
      return filters;
    };

    it("rings every station but the selected one, so a selected station shows no hover ring", () => {
      assert.deepEqual(hover("laird", "laird", { nameDrawn: true })["transit-station-hover"], ["!=", ["get", "stationId"], "laird"]);
    });

    it("draws a hovered name's copy only when its own name lost a collision", () => {
      assert.deepEqual(hover("laird", null, { nameDrawn: false })["transit-station-labels-hover"], ["==", ["get", "stationId"], "laird"]);
      assert.deepEqual(hover("laird", null, { nameDrawn: true })["transit-station-labels-hover"], ["==", ["get", "stationId"], ""]);
    });

    it("leaves the copy on its station when hover ends, so it can fade out", () => {
      assert.equal(hover(null, null)["transit-station-labels-hover"], undefined);
    });
  });

  describe("createGeographicStationHoverAnimator", () => {
    const setup = (reducedMotion = false) => {
      let time = 0;
      const frames = [];
      const states = new Map();
      const map = {
        getSource: () => ({}),
        setFeatureState: ({ id }, { hover }) => states.set(id, hover),
      };
      const animator = createGeographicStationHoverAnimator(map, {
        reducedMotion: () => reducedMotion,
        now: () => time,
        requestFrame: (callback) => frames.push(callback),
        cancelFrame: () => {},
      });
      const advance = (ms) => {
        time += ms;
        const pending = frames.splice(0);
        pending.forEach((callback) => callback(time));
      };
      return { animator, states, advance };
    };

    it("eases hover in and out over the System Map's 120 ms", () => {
      const { animator, states, advance } = setup();
      animator.setHovered("laird");
      advance(GEOGRAPHIC_STATION_HOVER_EASE_MS / 2);
      assert.equal(states.get("laird"), 0.5, "halfway, eased in and out symmetrically");
      advance(GEOGRAPHIC_STATION_HOVER_EASE_MS / 2);
      assert.equal(states.get("laird"), 1);

      animator.setHovered("leaside");
      advance(GEOGRAPHIC_STATION_HOVER_EASE_MS / 4);
      assert.ok(states.get("laird") > 0.5 && states.get("laird") < 1, "the old station fades out");
      assert.ok(states.get("leaside") > 0 && states.get("leaside") < 0.5, "the new one fades in");
      advance(GEOGRAPHIC_STATION_HOVER_EASE_MS);
      assert.equal(states.get("laird"), 0);
      assert.equal(states.get("leaside"), 1);
    });

    it("changes at once under reduced motion", () => {
      const { animator, states } = setup(true);
      animator.setHovered("laird");
      assert.equal(states.get("laird"), 1);
      animator.setHovered(null);
      assert.equal(states.get("laird"), 0);
    });
  });

  describe("updateGeographicImpactSelection", () => {
    it("sets impact selection filters across link and station layers", () => {
      const filterCalls = [];
      const paintCalls = [];
      const mockMap = {
        getLayer: (id) => [
          "transit-impacts-selection",
          "transit-station-impacts-selection",
          "transit-planned-station-selection",
        ].includes(id),
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        setPaintProperty: (id, prop, val) => paintCalls.push({ id, prop, val }),
      };

      updateGeographicImpactSelection(mockMap, { kind: "delay", id: "alert-123" });

      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-impacts-selection")?.filter,
        ["in", "alert-123", ["get", "allCardIds"]],
      );
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-station-impacts-selection")?.filter,
        ["in", "alert-123", ["get", "allCardIds"]],
      );
    });

    it("configures planned station selection and stroke color for planned closures", () => {
      const filterCalls = [];
      const paintCalls = [];
      const mockMap = {
        getLayer: () => true,
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        setPaintProperty: (id, prop, val) => paintCalls.push({ id, prop, val }),
      };

      const plannedClosures = [
        {
          id: "closure-1",
          previewStationIds: ["stn-a", "stn-b"],
          activeNow: true,
        },
      ];

      updateGeographicImpactSelection(mockMap, { kind: "planned-closure", id: "closure-1" }, plannedClosures);

      const plannedFilter = filterCalls.find((c) => c.id === "transit-planned-station-selection");
      assert.deepEqual(plannedFilter?.filter, ["in", ["get", "stationId"], ["literal", ["stn-a", "stn-b"]]]);

      const strokeCall = paintCalls.find((c) => c.id === "transit-planned-station-selection" && c.prop === "circle-stroke-color");
      assert.equal(strokeCall?.val, "#ef4444", "Active-now planned closure uses red stroke");
    });

    it("clears impact selection when selection is null", () => {
      const filterCalls = [];
      const mockMap = {
        getLayer: () => true,
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        setPaintProperty: () => {},
      };

      updateGeographicImpactSelection(mockMap, null);

      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-impacts-selection")?.filter,
        ["==", ["get", "impactCardId"], ""],
      );
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-station-impacts-selection")?.filter,
        ["==", ["get", "cardId"], ""],
      );
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-planned-station-selection")?.filter,
        ["==", ["get", "stationId"], ""],
      );
    });
  });

  describe("updateGeographicSelectionStyling", () => {
    it("coordinates station and impact selection styling together", () => {
      const filterCalls = [];
      const mockMap = {
        getLayer: () => true,
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        setPaintProperty: () => {},
      };

      updateGeographicSelectionStyling(mockMap, {
        selectedStationId: "union",
        selection: { kind: "delay", id: "delay-456" },
      });

      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-station-selection")?.filter,
        ["==", ["get", "stationId"], "union"],
      );
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-impacts-selection")?.filter,
        ["in", "delay-456", ["get", "allCardIds"]],
      );
    });
  });

  describe("applyGeographicDynamicState and applyDynamicDataAndFilters", () => {
    it("applies dynamic sources, line filter, and selection in a single call", () => {
      const sourcesUpdated = [];
      const paintCalls = [];
      const filterCalls = [];

      const mockMap = {
        getSource: (id) => ({
          setData: (data) => sourcesUpdated.push({ id, data }),
        }),
        getLayer: () => true,
        setPaintProperty: (id, prop, val) => paintCalls.push({ id, prop, val }),
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        hasImage: () => true,
      };

      const overlayData = {
        impactedLinks: { type: "FeatureCollection", features: [] },
        impactedStations: { type: "FeatureCollection", features: [] },
        impactBadges: { type: "FeatureCollection", features: [] },
        impactArrows: { type: "FeatureCollection", features: [] },
        trainMarkers: { type: "FeatureCollection", features: [] },
        commuteLinks: { type: "FeatureCollection", features: [] },
        commuteStations: { type: "FeatureCollection", features: [] },
      };

      applyGeographicDynamicState(mockMap, {
        overlayData,
        activeFilteredLine: "line-2",
        selectedStationId: "st-george",
        selection: { kind: "suspension", id: "susp-789" },
      });

      assert.equal(sourcesUpdated.length, 7);
      assert.ok(paintCalls.some((c) => c.id === "transit-routes" && c.prop === "line-opacity"));
      assert.ok(filterCalls.some((c) => c.id === "transit-station-selection"));
      assert.ok(filterCalls.some((c) => c.id === "transit-impacts-selection"));
    });

    it("applyDynamicDataAndFilters preserves positional argument contract", () => {
      const sourcesUpdated = [];
      const filterCalls = [];

      const mockMap = {
        getSource: (id) => ({
          setData: (data) => sourcesUpdated.push({ id, data }),
        }),
        getLayer: () => true,
        setPaintProperty: () => {},
        setFilter: (id, filter) => filterCalls.push({ id, filter }),
        hasImage: () => true,
      };

      const overlay = {
        impactedLinks: { type: "FeatureCollection", features: [] },
        impactedStations: { type: "FeatureCollection", features: [] },
        impactBadges: { type: "FeatureCollection", features: [] },
        impactArrows: { type: "FeatureCollection", features: [] },
        trainMarkers: { type: "FeatureCollection", features: [] },
        commuteLinks: { type: "FeatureCollection", features: [] },
        commuteStations: { type: "FeatureCollection", features: [] },
      };

      applyDynamicDataAndFilters(mockMap, overlay, "line-1", "finch", "card-1");

      assert.equal(sourcesUpdated.length, 7);
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-station-selection")?.filter,
        ["==", ["get", "stationId"], "finch"],
      );
      assert.deepEqual(
        filterCalls.find((c) => c.id === "transit-impacts-selection")?.filter,
        ["in", "card-1", ["get", "allCardIds"]],
      );
    });
  });

  describe("installTransitLayers", () => {
    it("registers static and dynamic sources, installs 29 layers, and is idempotent", () => {
      const addedSources = {};
      const addedLayers = [];

      const mockMap = {
        getSource: (id) => addedSources[id],
        addSource: (id, config) => {
          addedSources[id] = { ...config, setData: (data) => { addedSources[id].data = data; } };
        },
        getLayer: (id) => addedLayers.find((l) => l.id === id),
        addLayer: (layer, beforeId) => {
          const index = beforeId ? addedLayers.findIndex((l) => l.id === beforeId) : -1;
          if (index >= 0) addedLayers.splice(index, 0, layer);
          else addedLayers.push(layer);
        },
        moveLayer: () => {},
        hasImage: () => false,
        addImage: () => {},
      };

      const mockCatalog = {
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
            properties: { featureType: "link", lineId: "line-1", segmentId: "seg-1", stationAId: "stn-1", stationBId: "stn-2" },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: { featureType: "station", stationId: "stn-1", lineIds: ["line-1"], name: "Station 1" },
          },
        ],
      };

      installTransitLayers(mockMap, mockCatalog, "ttc", false, false);

      // Verify static sources added
      assert.ok(addedSources["transit-links"]);
      assert.ok(addedSources["transit-stations"]);
      assert.ok(addedSources["transit-line-badges"]);

      // Verify dynamic sources added
      assert.ok(addedSources["transit-impacts"]);
      assert.ok(addedSources["transit-impact-stations"]);
      assert.ok(addedSources["transit-impact-badges"]);
      assert.ok(addedSources["transit-commute-links"]);
      assert.ok(addedSources["transit-commute-stations"]);
      assert.ok(addedSources["transit-impact-arrows"]);
      assert.ok(addedSources["transit-train-markers"]);

      // Verify key layers added
      assert.ok(addedLayers.find((l) => l.id === "transit-routes"));
      assert.ok(addedLayers.find((l) => l.id === "transit-stations-outer"));
      assert.ok(addedLayers.find((l) => l.id === "transit-impacts-line"));
      assert.ok(addedLayers.find((l) => l.id === "transit-impact-badges"));
      assert.ok(addedLayers.find((l) => l.id === "transit-station-labels"));
      assert.ok(addedLayers.find((l) => l.id === "transit-train-markers-halo"));

      const layerCount = addedLayers.length;
      assert.equal(layerCount, 29, "Should install exactly 29 transit layers");

      // The selected alert's glow sits under its band, and both are wider than
      // the alert line so the selection shows beside its glyphs.
      const glow = addedLayers.find((l) => l.id === "transit-impacts-selection-glow");
      const band = addedLayers.find((l) => l.id === "transit-impacts-selection");
      assert.ok(addedLayers.indexOf(glow) < addedLayers.indexOf(band));
      const widthAt = (layer, zoom) => createExpression(layer.paint["line-width"], "paint.line-width").value
        .evaluateWithoutErrorHandling({ zoom }, { properties: {} });
      const line = addedLayers.find((l) => l.id === "transit-impacts-line");
      for (const zoom of [9, 14, 17]) {
        assert.ok(widthAt(band, zoom) >= 2.5 * widthAt(line, zoom), `band at zoom ${zoom}`);
        assert.ok(widthAt(glow, zoom) > widthAt(band, zoom), `glow at zoom ${zoom}`);
      }

      // Station names take their placement from the station, and alert badges keep names clear.
      assert.ok(addedSources["transit-stations"].data.features[0].properties.labelPlacements.length >= 2);
      assert.equal(addedSources["transit-stations"].promoteId, "stationId");
      assert.equal(addedLayers.find((l) => l.id === "transit-impact-badges").layout["icon-ignore-placement"], false);

      // Station hover: a ring under the station marker, a lifted name that
      // always draws, and a pointer target a little larger than the marker.
      const ids = addedLayers.map((l) => l.id);
      assert.ok(ids.indexOf("transit-station-hover") < ids.indexOf("transit-stations-outer"));
      const hoverLabel = addedLayers.find((l) => l.id === "transit-station-labels-hover");
      assert.ok(ids.indexOf("transit-station-labels") < ids.indexOf("transit-station-labels-hover"));
      assert.equal(hoverLabel.layout["text-allow-overlap"], true);
      assert.deepEqual(hoverLabel.layout["text-size"], addedLayers.find((l) => l.id === "transit-station-labels").layout["text-size"]);
      assert.ok(addedLayers.find((l) => l.id === "transit-station-labels").layout["text-variable-anchor-offset"]);
      const hit = addedLayers.find((l) => l.id === "transit-stations-hit");
      assert.equal(hit.paint["circle-opacity"], 0);

      // Line breadcrumbs: each line's authored badge along it, under station markers.
      const breadcrumbs = addedLayers.find((l) => l.id === "transit-line-breadcrumbs");
      assert.equal(breadcrumbs.source, "transit-line-breadcrumbs");
      assert.ok(addedSources["transit-line-breadcrumbs"]);
      // Always drawn, so collisions never thin them unevenly.
      assert.equal(breadcrumbs.layout["icon-allow-overlap"], true);
      // Only the current zoom level's set shows.
      const filter = featureFilter(breadcrumbs.filter, "layers[0].filter");
      const showsLevel = (zoom, level) => filter.filter({ zoom }, { properties: { level } });
      assert.equal(showsLevel(9.5, 0), true);
      assert.equal(showsLevel(9.5, 1), false);
      assert.equal(showsLevel(12.7, 3), true);
      assert.equal(showsLevel(12.7, 2), false);
      assert.equal(showsLevel(19, 8), true);
      const sprite = (expression, lineId) => createExpression(expression, "layout.icon-image").value
        .evaluateWithoutErrorHandling({ zoom: 12 }, { properties: { lineId } });
      assert.equal(sprite(breadcrumbs.layout["icon-image"], "line-1"), "line-badge-1");
      assert.equal(sprite(lineBreadcrumbSpriteExpression("regional"), "regional-ki"), "line-badge-KI");
      // Dimmed with the other lines under a line filter (evaluated at zoom 13, fully faded in).
      assert.equal(evaluateOpacity(lineBreadcrumbOpacityExpression("line-1"), { lineId: "line-2" }), 0.2);
      assert.equal(evaluateOpacity(lineBreadcrumbOpacityExpression("line-1"), { lineId: "line-1" }), 1);

      // Station names show sooner and larger (TTC from zoom 10.5).
      const labels = addedLayers.find((l) => l.id === "transit-station-labels");
      assert.equal(labels.minzoom, 10.5);

      // Verify idempotency on second call
      installTransitLayers(mockMap, mockCatalog, "ttc", false, false);
      assert.equal(addedLayers.length, layerCount, "Second call should not re-add existing layers");
    });
  });
});
