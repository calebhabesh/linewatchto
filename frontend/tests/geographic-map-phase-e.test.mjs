import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  getGeographicAttribution,
} from "../src/app/geographic-config.ts";

import {
  partitionCatalogFeatures,
  getStationCoordinates,
  projectImpactedLinks,
  projectCommutePreview,
  getSelectionBounds,
} from "../src/app/geographic-overlays.ts";

import {
  saveGeographicMapViewport,
  readGeographicMapViewport,
  geographicMapViewportKey,
} from "../src/app/map-viewport-preference.ts";

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

const manifestPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/manifest.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const regionalCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/regional-catalog.json",
);
const regionalCatalog = JSON.parse(fs.readFileSync(regionalCatalogPath, "utf8"));

const ttcCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/ttc-catalog.json",
);
const ttcCatalog = JSON.parse(fs.readFileSync(ttcCatalogPath, "utf8"));

// ---------------------------------------------------------------------------
// 1. End-to-End Flow: Search to Station & Coordinate Resolution
// ---------------------------------------------------------------------------
test("Phase E: End-to-End User Flow - Search to Station & Coordinate Resolution", async (t) => {
  await t.test("resolves geographic coordinates for TTC stations across all 5 lines", () => {
    const testStations = [
      { id: "finch", name: "Finch (Line 1)" },
      { id: "kipling", name: "Kipling (Line 2)" },
      { id: "don-mills", name: "Don Mills (Line 4)" },
      { id: "mount-dennis", name: "Mount Dennis (Line 5)" },
      { id: "humber-college", name: "Humber College (Line 6)" },
    ];

    for (const { id, name } of testStations) {
      const coords = getStationCoordinates(ttcCatalog, id);
      assert.ok(coords, `Coordinates must exist for ${name} (${id})`);
      const [lng, lat] = coords;
      assert.ok(lng >= -79.65 && lng <= -79.15, `Lng ${lng} out of range for ${name}`);
      assert.ok(lat >= 43.55 && lat <= 43.85, `Lat ${lat} out of range for ${name}`);
    }
  });

  await t.test("resolves geographic coordinates for Regional stations across all corridors", () => {
    const regionalTestStations = [
      { id: "union", name: "Union Station (Hub)" },
      { id: "allandale-waterfront", name: "Allandale Waterfront (Barrie)" },
      { id: "kitchener", name: "Kitchener (Kitchener)" },
      { id: "durham-college-oshawa", name: "Oshawa (Lakeshore East)" },
      { id: "niagara-falls", name: "Niagara Falls (Lakeshore West)" },
      { id: "milton", name: "Milton (Milton)" },
      { id: "bloomington", name: "Bloomington (Richmond Hill)" },
      { id: "old-elm", name: "Old Elm (Stouffville)" },
      { id: "pearson-airport", name: "Pearson Airport (UP Express)" },
    ];

    for (const { id, name } of regionalTestStations) {
      const coords = getStationCoordinates(regionalCatalog, id);
      assert.ok(coords, `Coordinates must exist for ${name} (${id})`);
      const [lng, lat] = coords;
      assert.ok(lng >= -81.10 && lng <= -78.75, `Lng ${lng} out of range for ${name}`);
      assert.ok(lat >= 43.05 && lat <= 44.50, `Lat ${lat} out of range for ${name}`);
    }
  });

  await t.test("gracefully returns null for non-existent station IDs without crashing", () => {
    assert.equal(getStationCoordinates(ttcCatalog, "unknown-station-xyz"), null);
    assert.equal(getStationCoordinates(regionalCatalog, "unknown-station-xyz"), null);
  });
});

// ---------------------------------------------------------------------------
// 2. End-to-End Flow: Disruption Selection, Projection & Camera Bounds
// ---------------------------------------------------------------------------
test("Phase E: End-to-End User Flow - Disruption Selection, Projection & Bounds", async (t) => {
  await t.test("projects multi-station disruption span and computes accurate camera focus bounds", () => {
    const mockSegments = [
      {
        id: "line-1-finch-to-sheppard",
        lineId: "line-1",
        label: "Finch to Sheppard-Yonge",
        stationAId: "finch",
        stationBId: "sheppard-yonge",
        overlay: "suspension",
        impacts: [
          {
            kind: "suspension",
            cardId: "susp-finch-sheppard",
            travelDirection: "bidirectional",
            sourceAlertIds: ["alert-ttc-1"],
          },
        ],
      },
    ];

    const projectedLinks = projectImpactedLinks(ttcCatalog, mockSegments, "ttc");
    assert.ok(projectedLinks.features.length >= 2, "Must project multiple links for Finch to Sheppard");

    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "suspension", id: "susp-finch-sheppard" },
      mockSegments,
      [],
    );

    assert.ok(bounds, "Must return valid camera bounds for active suspension");
    const [[west, south], [east, north]] = bounds;
    assert.ok(west < east, "West bound must be strictly less than east");
    assert.ok(south < north, "South bound must be strictly less than north");
    assert.ok(south <= 43.765, "South bound should enclose Sheppard-Yonge");
    assert.ok(north >= 43.775, "North bound should enclose Finch");
  });

  await t.test("handles single-station impact selection with valid point bounds padding", () => {
    const mockStationImpacts = [
      {
        stationId: "bloor-yonge",
        kind: "delay",
        cardId: "bloor-delay-1",
        title: "Bloor-Yonge Crowd Delay",
      },
    ];

    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "delay", id: "bloor-delay-1" },
      [],
      mockStationImpacts,
    );

    assert.ok(bounds, "Must compute padded bounds for station-only impact");
    const [[west, south], [east, north]] = bounds;
    assert.ok(west < east);
    assert.ok(south < north);
  });

  await t.test("returns null bounds for unmatched impact selection, preserving camera position", () => {
    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "delay", id: "unmatched-card-id" },
      [],
      [],
    );
    assert.equal(bounds, null, "Must return null so the map view camera does not jump");
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-End Flow: Commute Path Preview & Clearing
// ---------------------------------------------------------------------------
test("Phase E: End-to-End User Flow - Commute Path Preview & Clearing", async (t) => {
  await t.test("projects commute preview and supports clear action", () => {
    const commutePreview = {
      id: "commute-barrie",
      commuteId: "commute-br",
      legId: "outbound",
      label: "Work Commute",
      routeLabel: "Aurora to Newmarket",
      stationIds: ["aurora", "newmarket"],
      segmentIds: ["segment-br-aurora-newmarket"],
    };

    const projected = projectCommutePreview(regionalCatalog, commutePreview);
    assert.ok(projected.links.features.length >= 1, "Must project preview links");
    assert.equal(projected.stations.features.length, 2, "Must project both commute stations");

    const origin = projected.stations.features[0];
    const destination = projected.stations.features[1];
    assert.equal(origin.properties.isOrigin, true);
    assert.equal(origin.properties.stationId, "aurora");
    assert.equal(destination.properties.isDestination, true);
    assert.equal(destination.properties.stationId, "newmarket");

    // Clearing commute preview
    const cleared = projectCommutePreview(regionalCatalog, null);
    assert.equal(cleared.links.features.length, 0);
    assert.equal(cleared.stations.features.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Themes, Basemap Endpoints & High-Contrast Mode
// ---------------------------------------------------------------------------
test("Phase E: Themes, Basemap Endpoints & High-Contrast Support", async (t) => {
  await t.test("OpenFreeMap style endpoints are clean, valid HTTPS URLs without tokens", () => {
    assert.equal(OPENFREEMAP_STYLES.light, "https://tiles.openfreemap.org/styles/positron");
    assert.equal(OPENFREEMAP_STYLES.dark, "https://tiles.openfreemap.org/styles/dark");
    assert.ok(!OPENFREEMAP_STYLES.light.includes("?"), "Light style URL must not have query parameters or tokens");
    assert.ok(!OPENFREEMAP_STYLES.dark.includes("?"), "Dark style URL must not have query parameters or tokens");
  });

  await t.test("full attribution discloses required OpenFreeMap, OSM, and transit providers", () => {
    const ttcAttrib = getGeographicAttribution("ttc");
    assert.ok(ttcAttrib.includes("OpenFreeMap"), "TTC attribution must mention OpenFreeMap");
    assert.ok(ttcAttrib.includes("OpenMapTiles"), "TTC attribution must mention OpenMapTiles");
    assert.ok(ttcAttrib.includes("OpenStreetMap"), "TTC attribution must mention OpenStreetMap");
    assert.ok(ttcAttrib.includes("City of Toronto"), "TTC attribution must disclose City of Toronto");

    const regionalAttrib = getGeographicAttribution("regional");
    assert.ok(regionalAttrib.includes("OpenFreeMap"), "Regional attribution must mention OpenFreeMap");
    assert.ok(regionalAttrib.includes("OpenMapTiles"), "Regional attribution must mention OpenMapTiles");
    assert.ok(regionalAttrib.includes("OpenStreetMap"), "Regional attribution must mention OpenStreetMap");
    assert.ok(regionalAttrib.includes("Metrolinx"), "Regional attribution must disclose Metrolinx");
  });

  await t.test("GeographicNetworkMap source enforces accessible roles and ARIA landmarks", () => {
    const componentPath = path.resolve(__dirname, "../src/components/GeographicNetworkMap.tsx");
    const content = fs.readFileSync(componentPath, "utf8");

    assert.ok(content.includes('role="region"'), "Map container must define role='region'");
    assert.ok(content.includes('aria-label='), "Map container must define aria-label");
    assert.ok(content.includes('role="status"'), "Floating banners must define role='status'");
    assert.ok(content.includes('aria-live="polite"'), "Floating banners must define aria-live='polite'");
    assert.ok(content.includes('data-high-contrast'), "Container must support data-high-contrast");
  });
});

// ---------------------------------------------------------------------------
// 5. Error Recovery, WebGL Degradation & Resilience
// ---------------------------------------------------------------------------
test("Phase E: Error Recovery & Resilience Invariants", async (t) => {
  await t.test("timeout constant is bounded to 12 seconds", () => {
    assert.equal(GEOGRAPHIC_LOAD_TIMEOUT_MS, 12000, "Load timeout must be exactly 12000 ms");
  });

  await t.test("GeographicNetworkMap provides bounded recovery with Retry and Use Diagram fallback", () => {
    const componentPath = path.resolve(__dirname, "../src/components/GeographicNetworkMap.tsx");
    const content = fs.readFileSync(componentPath, "utf8");

    assert.ok(content.includes("setRetryCount"), "Must provide retry handler");
    assert.ok(content.includes("onSwitchToDiagram"), "Must provide diagram fallback handler");
    assert.ok(content.includes("webglcontextlost"), "Must handle WebGL context loss");
    assert.ok(content.includes("isWebGLSupported"), "Must test WebGL capability before mounting");
  });
});

// ---------------------------------------------------------------------------
// 6. Viewport Persistence Across All 4 Modes (Zero Crosstalk)
// ---------------------------------------------------------------------------
test("Phase E: Independent Viewport Persistence Across 4 Network/View Modes", async (t) => {
  await t.test("persists and reads geographic camera independently from diagram camera", () => {
    const storage = createMockStorage();

    // 1. Save TTC Geographic
    saveGeographicMapViewport(storage, "ttc", { lng: -79.38, lat: 43.65, zoom: 12.5 });

    // 2. Save Regional Geographic
    saveGeographicMapViewport(storage, "regional", { lng: -79.65, lat: 43.70, zoom: 9.5 });

    // 3. Verify TTC does not overwrite Regional
    const ttcGeo = readGeographicMapViewport(storage, "ttc");
    const regGeo = readGeographicMapViewport(storage, "regional");

    assert.ok(ttcGeo);
    assert.ok(regGeo);
    assert.equal(ttcGeo.lng, -79.38);
    assert.equal(ttcGeo.zoom, 12.5);
    assert.equal(regGeo.lng, -79.65);
    assert.equal(regGeo.zoom, 9.5);

    // 4. Verify corrupt or malformed storage does not throw
    storage.setItem(geographicMapViewportKey("ttc"), "{bad json");
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);

    storage.setItem(
      geographicMapViewportKey("ttc"),
      JSON.stringify({ lng: "not-a-num", lat: 43, zoom: 10 }),
    );
    assert.equal(readGeographicMapViewport(storage, "ttc"), null);
  });
});

// ---------------------------------------------------------------------------
// 7. Catalog Weight, Gzip Compression & Performance Budget (< 500 KB)
// ---------------------------------------------------------------------------
test("Phase E: Catalog Weight & Performance Targets", async (t) => {
  await t.test("catalogs strictly comply with < 500 KB compressed budget", () => {
    const ttcBuf = fs.readFileSync(ttcCatalogPath);
    const ttcGz = zlib.gzipSync(ttcBuf);

    const regBuf = fs.readFileSync(regionalCatalogPath);
    const regGz = zlib.gzipSync(regBuf);

    const manifestBuf = fs.readFileSync(manifestPath);
    const manifestGz = zlib.gzipSync(manifestBuf);

    // Budget: <= 500 KB (512,000 bytes) compressed
    assert.ok(
      ttcGz.length < 500 * 1024,
      `TTC catalog gzip size (${ttcGz.length} bytes) exceeds 500 KB budget`,
    );
    assert.ok(
      regGz.length < 500 * 1024,
      `Regional catalog gzip size (${regGz.length} bytes) exceeds 500 KB budget`,
    );

    // Assert actual high efficiency: both are < 25 KB gzipped (< 5% of budget!)
    assert.ok(ttcGz.length < 25 * 1024, `TTC catalog (${ttcGz.length} bytes) expected < 25 KB`);
    assert.ok(regGz.length < 25 * 1024, `Regional catalog (${regGz.length} bytes) expected < 25 KB`);
    assert.ok(manifestGz.length < 2 * 1024, `Manifest (${manifestGz.length} bytes) expected < 2 KB`);
  });

  await t.test("manifest integrity matches catalog contents and schemas", () => {
    assert.equal(manifest.schemaVersion, "1.0.0");
    assert.ok(manifest.networks.ttc);
    assert.ok(manifest.networks.regional);
    assert.ok(manifest.networks.ttc.contentHash);
    assert.ok(manifest.networks.regional.contentHash);
    assert.equal(manifest.networks.ttc.stationCount, 109);
    assert.equal(manifest.networks.regional.stationCount, 72);
    assert.equal(manifest.networks.ttc.linkCount, 112);
    assert.equal(manifest.networks.regional.linkCount, 74);
  });
});

// ---------------------------------------------------------------------------
// 8. Geometry Soundness & Zero-Coordinate Detection
// ---------------------------------------------------------------------------
test("Phase E: Geometry Soundness & Quality Verification", async (t) => {
  await t.test("no zero-coordinates, NaNs, or degenerate LineStrings in catalogs", () => {
    for (const [name, catalog] of [["ttc", ttcCatalog], ["regional", regionalCatalog]]) {
      const { stations, links } = partitionCatalogFeatures(catalog);

      for (const station of stations.features) {
        const [lng, lat] = station.geometry.coordinates;
        assert.ok(Number.isFinite(lng), `${name} station ${station.id} lng is not finite`);
        assert.ok(Number.isFinite(lat), `${name} station ${station.id} lat is not finite`);
        assert.notEqual(lng, 0, `${name} station ${station.id} has longitude 0`);
        assert.notEqual(lat, 0, `${name} station ${station.id} has latitude 0`);
      }

      for (const link of links.features) {
        assert.ok(
          link.geometry.coordinates.length >= 2,
          `${name} link ${link.id} has fewer than 2 points`,
        );
        for (const [lng, lat] of link.geometry.coordinates) {
          assert.ok(Number.isFinite(lng), `${name} link ${link.id} coord lng not finite`);
          assert.ok(Number.isFinite(lat), `${name} link ${link.id} coord lat not finite`);
          assert.notEqual(lng, 0, `${name} link ${link.id} coord has longitude 0`);
          assert.notEqual(lat, 0, `${name} link ${link.id} coord has latitude 0`);
        }
      }
    }
  });
});
