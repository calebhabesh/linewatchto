import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defaultVisualPreferences,
  readVisualPreferencesFromStorage,
  writeVisualPreferencesToStorage,
  initialVisualPreferencesFromCookie,
  buildVisualPreferencesCookie,
} from "../src/app/visual-preferences.ts";

import {
  saveGeographicMapViewport,
  readGeographicMapViewport,
  clearGeographicMapViewport,
  geographicMapViewportKey,
} from "../src/app/map-viewport-preference.ts";

import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  TTC_GEOGRAPHIC_BOUNDS,
  TTC_GEOGRAPHIC_CENTER,
  TTC_LINE_COLORS,
  GEOGRAPHIC_ATTRIBUTION,
} from "../src/app/geographic-config.ts";

import {
  partitionCatalogFeatures,
  getStationCoordinates,
} from "../src/app/geographic-overlays.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    get size() {
      return store.size;
    },
  };
}

test("Visual preferences: mapView preference contract", async (t) => {
  await t.test("default is diagram", () => {
    assert.equal(defaultVisualPreferences.mapView, "diagram");
  });

  await t.test("reads stored diagram and geographic", () => {
    const s1 = createMockStorage({ "linewatch-map-view-v1": "geographic" });
    assert.equal(readVisualPreferencesFromStorage(s1).mapView, "geographic");

    const s2 = createMockStorage({ "linewatch-map-view-v1": "diagram" });
    assert.equal(readVisualPreferencesFromStorage(s2).mapView, "diagram");
  });

  await t.test("ignores invalid stored map view and returns null", () => {
    const s = createMockStorage({ "linewatch-map-view-v1": "satellite-3d" });
    assert.equal(readVisualPreferencesFromStorage(s).mapView, null);
  });

  await t.test("writes mapView to storage", () => {
    const storage = createMockStorage();
    writeVisualPreferencesToStorage(storage, {
      theme: "dark",
      highContrast: false,
      reducedMotion: null,
      estimatedTrainsEnabled: false,
      dotBackgroundEnabled: true,
      defaultNetwork: "ttc",
      mapView: "geographic",
    });
    assert.equal(storage.getItem("linewatch-map-view-v1"), "geographic");
  });

  await t.test("cookie serialization round-trip", () => {
    const cookie = buildVisualPreferencesCookie(
      {
        theme: "light",
        highContrast: true,
        reducedMotion: false,
        estimatedTrainsEnabled: true,
        dotBackgroundEnabled: false,
        defaultNetwork: "regional",
        mapView: "geographic",
      },
      "https:",
    );
    assert.ok(cookie.includes("geographic"));

    // Extract cookie value
    const match = cookie.match(/linewatch-visual-preferences-v1=([^;]+)/);
    assert.ok(match);
    const parsed = initialVisualPreferencesFromCookie(match[1]);
    assert.equal(parsed.mapView, "geographic");
    assert.equal(parsed.theme, "light");
    assert.equal(parsed.defaultNetwork, "regional");
  });

  await t.test("cookie fallback on missing or malformed payload", () => {
    assert.equal(initialVisualPreferencesFromCookie(undefined).mapView, "diagram");
    assert.equal(initialVisualPreferencesFromCookie("invalid-json!").mapView, "diagram");
    assert.equal(initialVisualPreferencesFromCookie(encodeURIComponent('{"mapView":"invalid"}')).mapView, "diagram");
  });
});

test("Geographic viewport: camera persistence & bounds validation", async (t) => {
  await t.test("saves and reads valid TTC geographic camera", () => {
    const storage = createMockStorage();
    const camera = { lng: -79.3832, lat: 43.6532, zoom: 12.5 };
    saveGeographicMapViewport(storage, "ttc", camera);

    const loaded = readGeographicMapViewport(storage, "ttc");
    assert.ok(loaded);
    assert.equal(loaded.lng, -79.3832);
    assert.equal(loaded.lat, 43.6532);
    assert.equal(loaded.zoom, 12.5);
  });

  await t.test("rejects out-of-bounds coordinates", () => {
    const storage = createMockStorage();
    // Too far west (Vancouver)
    saveGeographicMapViewport(storage, "ttc", { lng: -123.1, lat: 49.28, zoom: 12 });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    // Too far east (London, UK)
    saveGeographicMapViewport(storage, "ttc", { lng: 0.1, lat: 51.5, zoom: 12 });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    // Zoom too small or too large
    saveGeographicMapViewport(storage, "ttc", { lng: -79.38, lat: 43.65, zoom: 1 });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    saveGeographicMapViewport(storage, "ttc", { lng: -79.38, lat: 43.65, zoom: 35 });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    // Non-finite values
    saveGeographicMapViewport(storage, "ttc", { lng: NaN, lat: 43.65, zoom: 12 });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);
  });

  await t.test("gracefully recovers from corrupt storage", () => {
    const storage = createMockStorage({
      [geographicMapViewportKey("ttc")]: "not-valid-json{{{",
    });
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    const wrongVersion = createMockStorage({
      [geographicMapViewportKey("ttc")]: JSON.stringify({ version: 99, lng: -79.38, lat: 43.65, zoom: 12 }),
    });
    assert.equal(readGeographicMapViewport(wrongVersion, "ttc"), null);
  });

  await t.test("clears stored viewport", () => {
    const storage = createMockStorage();
    saveGeographicMapViewport(storage, "ttc", { lng: -79.3832, lat: 43.6532, zoom: 12.5 });
    assert.ok(readGeographicMapViewport(storage, "ttc"));
    clearGeographicMapViewport(storage, "ttc");
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);
  });
});

test("Geographic overlays: catalog partitioning & station projection", async (t) => {
  const catalogPath = path.resolve(__dirname, "../public/assets/linewatch/geographic/ttc-catalog.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  await t.test("partitions links and stations cleanly", () => {
    const { links, stations } = partitionCatalogFeatures(catalog);
    assert.equal(stations.features.length, 109);
    assert.equal(links.features.length, 112);
    assert.equal(links.type, "FeatureCollection");
    assert.equal(stations.type, "FeatureCollection");
  });

  await t.test("retrieves station coordinates correctly", () => {
    const bloorYongeCoords = getStationCoordinates(catalog, "bloor-yonge");
    assert.ok(bloorYongeCoords);
    assert.equal(bloorYongeCoords.length, 2);
    assert.ok(bloorYongeCoords[0] < -79.0 && bloorYongeCoords[0] > -80.0);
    assert.ok(bloorYongeCoords[1] > 43.0 && bloorYongeCoords[1] < 44.0);

    const unionCoords = getStationCoordinates(catalog, "union");
    assert.ok(unionCoords);

    const unknownCoords = getStationCoordinates(catalog, "non-existent-station");
    assert.equal(unknownCoords, null);

    assert.equal(getStationCoordinates(catalog, null), null);
  });
});

test("Geographic configuration & seam invariants", async (t) => {
  await t.test("restrained OpenFreeMap style endpoints", () => {
    assert.ok(OPENFREEMAP_STYLES.light.includes("positron"));
    assert.ok(OPENFREEMAP_STYLES.dark.includes("dark"));
  });

  await t.test("timeout and bounds", () => {
    assert.equal(GEOGRAPHIC_LOAD_TIMEOUT_MS, 12000);
    assert.equal(TTC_GEOGRAPHIC_BOUNDS.length, 2);
    assert.ok(TTC_GEOGRAPHIC_BOUNDS[0][0] < TTC_GEOGRAPHIC_BOUNDS[1][0]); // west < east
    assert.ok(TTC_GEOGRAPHIC_BOUNDS[0][1] < TTC_GEOGRAPHIC_BOUNDS[1][1]); // south < north
    assert.equal(TTC_GEOGRAPHIC_CENTER.length, 2);
  });

  await t.test("TTC line colors cover Lines 1, 2, 4, 5, 6", () => {
    assert.equal(TTC_LINE_COLORS["line-1"], "#F8C300");
    assert.equal(TTC_LINE_COLORS["line-2"], "#00923F");
    assert.equal(TTC_LINE_COLORS["line-4"], "#A21A68");
    assert.equal(TTC_LINE_COLORS["line-5"], "#EB8738");
    assert.equal(TTC_LINE_COLORS["line-6"], "#969594");
  });

  await t.test("attribution string contains transit shapes attribution", () => {
    assert.ok(GEOGRAPHIC_ATTRIBUTION.includes("City of Toronto"));
  });
});

test("Bundle isolation: Diagram session does not load maplibre-gl", async (t) => {
  await t.test("globals.css does not import maplibre-gl.css", () => {
    const globalsCss = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    assert.equal(globalsCss.includes("maplibre-gl"), false);
  });

  await t.test("InteractiveTtcMap does not import maplibre-gl statically", () => {
    const ttcMap = fs.readFileSync(path.resolve(__dirname, "../src/components/InteractiveTtcMap.tsx"), "utf8");
    assert.equal(ttcMap.includes('from "maplibre-gl"'), false);
    assert.equal(ttcMap.includes('import("maplibre-gl")'), false);
  });

  await t.test("NetworkMap lazy-loads GeographicNetworkMap via next/dynamic", () => {
    const networkMap = fs.readFileSync(path.resolve(__dirname, "../src/components/NetworkMap.tsx"), "utf8");
    assert.ok(networkMap.includes('dynamic('));
    assert.ok(networkMap.includes('./GeographicNetworkMap'));
    assert.ok(networkMap.includes('ssr: false'));
  });
});
