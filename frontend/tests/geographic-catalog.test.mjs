import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  isGeographicStationFeature,
  isGeographicLinkFeature,
  getStationFeatures,
  getLinkFeatures,
  findStationFeature,
  findLinkFeaturesForStation,
} from "../src/app/geographic-catalog.ts";
import {
  haversine,
  perpendicularDistance,
  douglasPeucker,
  sliceShapeBetweenStations,
  validateCoordinate,
  GGH_BOUNDS,
} from "../../scripts/lib/geographic-geometry.mjs";
import { STATION_LINE_STATION_IDS } from "../src/app/station-data.ts";
import { REGIONAL_ROUTE_STATIONS, REGIONAL_ROUTE_LINKS } from "../src/app/regional-data.ts";
import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  TTC_LINE_COLORS,
  REGIONAL_LINE_COLORS,
  IMPACT_COLORS,
  REGIONAL_MAJOR_STATIONS,
  getGeographicAttribution,
} from "../src/app/geographic-config.ts";

const manifestUrl = new URL("../public/assets/linewatch/geographic/manifest.json", import.meta.url);
const ttcCatalogUrl = new URL("../public/assets/linewatch/geographic/ttc-catalog.json", import.meta.url);
const regionalCatalogUrl = new URL("../public/assets/linewatch/geographic/regional-catalog.json", import.meta.url);

const manifestRaw = readFileSync(manifestUrl, "utf8");
const ttcRaw = readFileSync(ttcCatalogUrl, "utf8");
const regionalRaw = readFileSync(regionalCatalogUrl, "utf8");

const manifest = JSON.parse(manifestRaw);
const ttcCatalog = JSON.parse(ttcRaw);
const regionalCatalog = JSON.parse(regionalRaw);

describe("geographic catalog manifest & provenance", () => {
  it("conforms to manifest schema 1.0.0 with valid content hashes", () => {
    assert.equal(manifest.schemaVersion, "1.0.0");
    assert.ok(manifest.contentVersion && typeof manifest.contentVersion === "string");
    assert.ok(manifest.generatedAt && typeof manifest.generatedAt === "string");

    const computedTtcHash = createHash("sha256").update(ttcRaw).digest("hex");
    const computedRegionalHash = createHash("sha256").update(regionalRaw).digest("hex");

    assert.equal(manifest.networks.ttc.contentHash, computedTtcHash);
    assert.equal(manifest.networks.regional.contentHash, computedRegionalHash);

    const computedCombinedHash = createHash("sha256")
      .update(computedTtcHash)
      .update(computedRegionalHash)
      .digest("hex");
    assert.equal(manifest.contentVersion, computedCombinedHash);
  });

  it("includes authoritative licenses, publishers, and required attribution", () => {
    const ttc = manifest.networks.ttc;
    assert.equal(ttc.publisher, "Toronto Transit Commission (TTC)");
    assert.equal(ttc.license, "Open Government Licence – Toronto");
    assert.match(ttc.attribution, /Open Government Licence – Toronto/);
    assert.equal(ttc.feedVersion, "S1000538");
    assert.equal(ttc.feedStartDate, "2026-09-06");
    assert.equal(ttc.feedEndDate, "2026-10-31");

    const reg = manifest.networks.regional;
    assert.equal(reg.sources.go.publisher, "Metrolinx");
    assert.equal(reg.sources.go.license, "Metrolinx Open Data Terms and Conditions");
    assert.match(reg.sources.go.attribution, /Contains Metrolinx Open Data/);
    assert.equal(reg.sources.go.feedVersion, "20260917132342");

    assert.equal(reg.sources.up.publisher, "Metrolinx");
    assert.equal(reg.sources.up.license, "Metrolinx Open Data Terms and Conditions");
    assert.match(reg.sources.up.attribution, /Contains Metrolinx Open Data/);
    assert.equal(reg.sources.up.feedVersion, "20260903104434");
  });
});

describe("TTC geographic catalog", () => {
  it("covers 100% of application topology (109 stations, 112 links, 0 gaps)", () => {
    assert.equal(ttcCatalog.type, "FeatureCollection");
    assert.equal(ttcCatalog.network, "ttc");
    assert.equal(ttcCatalog.coverage.status, "complete");
    assert.equal(ttcCatalog.coverage.missingStations.length, 0);
    assert.equal(ttcCatalog.coverage.missingLinks.length, 0);

    const stations = getStationFeatures(ttcCatalog);
    const links = getLinkFeatures(ttcCatalog);

    assert.equal(stations.length, 109);
    assert.equal(links.length, 112);
    assert.equal(ttcCatalog.features.length, 221);

    // Verify all stations in STATION_LINE_STATION_IDS exist
    for (const [lineId, lineStationIds] of Object.entries(STATION_LINE_STATION_IDS)) {
      for (const stId of lineStationIds) {
        const found = findStationFeature(ttcCatalog, stId);
        assert.ok(found, `Missing station ${stId} from line ${lineId} in TTC catalog`);
        assert.ok(found.properties.lineIds.includes(lineId));
      }
    }

    // Check spelling quirks
    assert.ok(findStationFeature(ttcCatalog, "greenwoood"));
    assert.ok(findStationFeature(ttcCatalog, "o_connor"));
  });

  it("validates all TTC coordinates, endpoint snapping, and hop bounds", () => {
    const stationsMap = new Map(getStationFeatures(ttcCatalog).map((s) => [s.properties.stationId, s]));
    const links = getLinkFeatures(ttcCatalog);

    for (const station of stationsMap.values()) {
      assert.equal(station.geometry.type, "Point");
      validateCoordinate(station.geometry.coordinates);
    }

    for (const link of links) {
      assert.equal(link.geometry.type, "LineString");
      const coords = link.geometry.coordinates;
      assert.ok(coords.length >= 2);

      const stA = stationsMap.get(link.properties.stationAId);
      const stB = stationsMap.get(link.properties.stationBId);
      assert.ok(stA && stB, `Endpoints missing for link ${link.id}`);

      // First coordinate snaps exactly to Station A
      assert.deepEqual(coords[0], stA.geometry.coordinates);
      // Last coordinate snaps exactly to Station B
      assert.deepEqual(coords[coords.length - 1], stB.geometry.coordinates);

      // Validate all vertices and hop distances
      for (let i = 0; i < coords.length; i++) {
        validateCoordinate(coords[i]);
        if (i > 0) {
          const hop = haversine(coords[i - 1], coords[i]);
          assert.ok(hop < 25000, `Hop ${hop}m too large in link ${link.id}`);
        }
      }
    }
  });
});

describe("Regional geographic catalog", () => {
  it("covers 100% of application topology (72 stations, 74 links, 0 gaps)", () => {
    assert.equal(regionalCatalog.type, "FeatureCollection");
    assert.equal(regionalCatalog.network, "regional");
    assert.equal(regionalCatalog.coverage.status, "complete");
    assert.equal(regionalCatalog.coverage.missingStations.length, 0);
    assert.equal(regionalCatalog.coverage.missingLinks.length, 0);

    const stations = getStationFeatures(regionalCatalog);
    const links = getLinkFeatures(regionalCatalog);

    assert.equal(stations.length, 72);
    assert.equal(links.length, 74);
    assert.equal(regionalCatalog.features.length, 146);

    // Verify all stations in REGIONAL_ROUTE_STATIONS exist
    for (const [routeCode, stIds] of Object.entries(REGIONAL_ROUTE_STATIONS)) {
      for (const stId of stIds) {
        const found = findStationFeature(regionalCatalog, stId);
        assert.ok(found, `Missing station ${stId} from corridor ${routeCode} in Regional catalog`);
      }
    }

    // Verify all links in REGIONAL_ROUTE_LINKS exist
    for (const [routeCode, routeLinks] of Object.entries(REGIONAL_ROUTE_LINKS)) {
      for (const [stA, stB] of routeLinks) {
        const segmentId = `segment-${routeCode.toLowerCase()}-${stA}-${stB}`;
        const found = links.find((l) => l.properties.segmentId === segmentId);
        assert.ok(found, `Missing link ${segmentId} for corridor ${routeCode}`);
      }
    }
  });

  it("handles Lakeshore West branching and shared Kitchener/UP corridor correctly", () => {
    const links = getLinkFeatures(regionalCatalog);

    // Lakeshore West branching after Aldershot
    const hamiltonLink = links.find((l) => l.properties.segmentId === "segment-lw-aldershot-hamilton");
    const westHarbourLink = links.find((l) => l.properties.segmentId === "segment-lw-aldershot-west-harbour");
    assert.ok(hamiltonLink, "Hamilton branch link must exist");
    assert.ok(westHarbourLink, "West Harbour branch link must exist");
    assert.notDeepEqual(hamiltonLink.geometry.coordinates, westHarbourLink.geometry.coordinates);

    // Shared corridor: Kitchener vs UP between Union and Weston
    const kiBloorMtd = links.find((l) => l.properties.segmentId === "segment-ki-bloor-mount-dennis");
    const upBloorMtd = links.find((l) => l.properties.segmentId === "segment-up-bloor-mount-dennis");
    assert.ok(kiBloorMtd && upBloorMtd);
    assert.equal(kiBloorMtd.properties.routeCode, "KI");
    assert.equal(upBloorMtd.properties.routeCode, "UP");
  });

  it("validates all Regional coordinates, endpoint snapping, and hop bounds", () => {
    const stationsMap = new Map(getStationFeatures(regionalCatalog).map((s) => [s.properties.stationId, s]));
    const links = getLinkFeatures(regionalCatalog);

    for (const station of stationsMap.values()) {
      assert.equal(station.geometry.type, "Point");
      validateCoordinate(station.geometry.coordinates);
    }

    for (const link of links) {
      assert.equal(link.geometry.type, "LineString");
      const coords = link.geometry.coordinates;
      assert.ok(coords.length >= 2);

      const stA = stationsMap.get(link.properties.stationAId);
      const stB = stationsMap.get(link.properties.stationBId);
      assert.ok(stA && stB, `Endpoints missing for link ${link.id}`);

      assert.deepEqual(coords[0], stA.geometry.coordinates);
      assert.deepEqual(coords[coords.length - 1], stB.geometry.coordinates);

      for (let i = 0; i < coords.length; i++) {
        validateCoordinate(coords[i]);
        if (i > 0) {
          const hop = haversine(coords[i - 1], coords[i]);
          assert.ok(hop < 30000, `Hop ${hop}m too large in link ${link.id}`);
        }
      }
    }
  });
});

describe("geometry weight budget (< 500 KB compressed)", () => {
  it("ensures TTC and Regional catalogs stay well below 500 KB compressed budget", () => {
    const ttcRawBytes = Buffer.byteLength(ttcRaw);
    const ttcGzBytes = gzipSync(Buffer.from(ttcRaw)).length;

    const regRawBytes = Buffer.byteLength(regionalRaw);
    const regGzBytes = gzipSync(Buffer.from(regionalRaw)).length;

    // Both should be under 500 KB even uncompressed
    assert.ok(ttcRawBytes < 500 * 1024, `TTC uncompressed ${ttcRawBytes} exceeds 500 KB`);
    assert.ok(regRawBytes < 500 * 1024, `Regional uncompressed ${regRawBytes} exceeds 500 KB`);

    // Gzipped size should be well under 50 KB (< 10% of budget)
    assert.ok(ttcGzBytes < 50 * 1024, `TTC gzipped ${ttcGzBytes} exceeds 50 KB`);
    assert.ok(regGzBytes < 50 * 1024, `Regional gzipped ${regGzBytes} exceeds 50 KB`);
  });
});

describe("pure geometric algorithms & fixture tests", () => {
  it("haversine computes accurate distances", () => {
    // Union to King is ~400m
    const union = [-79.379723, 43.645523];
    const king = [-79.378113, 43.649059];
    const d = haversine(union, king);
    assert.ok(d > 350 && d < 450, `Distance ${d} out of expected ~400m range`);
  });

  it("perpendicularDistance calculates planar offset to line segment", () => {
    const start = [-79.4, 43.7];
    const end = [-79.4, 43.8];
    const pt = [-79.401, 43.75];
    const dist = perpendicularDistance(pt, start, end);
    assert.ok(dist > 70 && dist < 90, `Perpendicular dist ${dist} out of expected ~80m range`);
  });

  it("defines standard Greater Golden Horseshoe bounds", () => {
    assert.deepEqual(GGH_BOUNDS, [-81.5, 42.5, -78.0, 45.0]);
  });

  it("douglasPeucker simplifies collinear points and retains corners", () => {
    const collinear = [
      [-79.4, 43.7],
      [-79.41, 43.71],
      [-79.42, 43.72],
      [-79.43, 43.73],
    ];
    const simplified = douglasPeucker(collinear, 5.0);
    assert.equal(simplified.length, 2);
    assert.deepEqual(simplified[0], collinear[0]);
    assert.deepEqual(simplified[1], collinear[collinear.length - 1]);

    const corner = [
      [-79.4, 43.7],
      [-79.4, 43.75], // sharp corner
      [-79.35, 43.75],
    ];
    const cornerSimplified = douglasPeucker(corner, 5.0);
    assert.equal(cornerSimplified.length, 3);
  });

  it("sliceShapeBetweenStations slices and auto-orients synthetic shape", () => {
    const stations = [
      { id: "A", coordinates: [-79.40, 43.70] },
      { id: "B", coordinates: [-79.41, 43.71] },
      { id: "C", coordinates: [-79.42, 43.72] },
    ];

    // Synthetic shape in reverse order C -> B -> A with intermediate curve
    const reversedShape = [
      [-79.4201, 43.7201],
      [-79.4150, 43.7150],
      [-79.4101, 43.7101],
      [-79.4050, 43.7050],
      [-79.4001, 43.7001],
    ];

    const links = sliceShapeBetweenStations(reversedShape, stations, { epsilonMeters: 1.0 });
    assert.equal(links.length, 2);
    assert.equal(links[0].stationAId, "A");
    assert.equal(links[0].stationBId, "B");
    assert.deepEqual(links[0].coordinates[0], stations[0].coordinates);
    assert.deepEqual(links[0].coordinates[links[0].coordinates.length - 1], stations[1].coordinates);

    assert.equal(links[1].stationAId, "B");
    assert.equal(links[1].stationBId, "C");
    assert.deepEqual(links[1].coordinates[0], stations[1].coordinates);
    assert.deepEqual(links[1].coordinates[links[1].coordinates.length - 1], stations[2].coordinates);
  });

  it("detects and rejects out-of-order station sequence", () => {
    const stations = [
      { id: "A", coordinates: [-79.40, 43.70] },
      { id: "C", coordinates: [-79.42, 43.72] },
      { id: "B", coordinates: [-79.41, 43.71] }, // inverted order
    ];
    const shape = [
      [-79.40, 43.70],
      [-79.41, 43.71],
      [-79.42, 43.72],
    ];

    assert.throws(
      () => sliceShapeBetweenStations(shape, stations),
      /Station ordering inversion/
    );
  });
});

describe("catalog helper utility functions", () => {
  it("findStationFeature and findLinkFeaturesForStation query features correctly", () => {
    const unionStation = findStationFeature(ttcCatalog, "union");
    assert.ok(unionStation);
    assert.equal(unionStation.properties.name, "Union");

    const unionLinks = findLinkFeaturesForStation(ttcCatalog, "union");
    assert.equal(unionLinks.length, 2); // st-andrew <-> union, union <-> king
    const linkPartners = unionLinks.map((l) =>
      l.properties.stationAId === "union" ? l.properties.stationBId : l.properties.stationAId
    );
    assert.ok(linkPartners.includes("st-andrew"));
    assert.ok(linkPartners.includes("king"));
  });

  it("isGeographicStationFeature and isGeographicLinkFeature act as accurate type guards", () => {
    const station = ttcCatalog.features[0];
    const isStation = isGeographicStationFeature(station);
    const isLink = isGeographicLinkFeature(station);
    assert.equal(isStation, !isLink);
  });
});

describe("geographic bundle isolation", () => {
  it("ensures diagram session does not load maplibre-gl statically", () => {
    const globalsCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    assert.equal(globalsCss.includes("maplibre-gl"), false);

    const ttcMap = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
    assert.equal(ttcMap.includes('from "maplibre-gl"'), false);
    assert.equal(ttcMap.includes('import("maplibre-gl")'), false);

    const networkMap = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
    assert.ok(networkMap.includes("dynamic("));
    assert.ok(networkMap.includes("./GeographicNetworkMap"));
    assert.ok(networkMap.includes("ssr: false"));
  });
});

describe("geographic configuration invariants", () => {
  it("restrains OpenFreeMap style endpoints to clean HTTPS URLs without tokens", () => {
    assert.equal(OPENFREEMAP_STYLES.light, "https://tiles.openfreemap.org/styles/positron");
    assert.equal(OPENFREEMAP_STYLES.dark, "https://tiles.openfreemap.org/styles/dark");
    assert.ok(!OPENFREEMAP_STYLES.light.includes("?"), "Light style must not contain query tokens");
    assert.ok(!OPENFREEMAP_STYLES.dark.includes("?"), "Dark style must not contain query tokens");
  });

  it("bounds load timeout between 5s and 15s", () => {
    assert.ok(GEOGRAPHIC_LOAD_TIMEOUT_MS >= 5000 && GEOGRAPHIC_LOAD_TIMEOUT_MS <= 15000);
    assert.equal(GEOGRAPHIC_LOAD_TIMEOUT_MS, 12000);
  });

  it("defines line colors covering all TTC lines and Regional corridors", () => {
    for (const lineId of ["line-1", "line-2", "line-4", "line-5", "line-6"]) {
      assert.ok(TTC_LINE_COLORS[lineId], `Missing color for TTC line ${lineId}`);
    }
    for (const corr of ["regional-br", "regional-ki", "regional-le", "regional-lw", "regional-mi", "regional-rh", "regional-st", "regional-up"]) {
      assert.ok(REGIONAL_LINE_COLORS[corr], `Missing color for Regional corridor ${corr}`);
    }
  });

  it("defines impact color palette and major terminal stations", () => {
    assert.ok(IMPACT_COLORS.suspension);
    assert.ok(IMPACT_COLORS.delayTtc);
    assert.ok(IMPACT_COLORS.delayRegional);
    assert.ok(IMPACT_COLORS.reducedSpeedZone);
    assert.ok(IMPACT_COLORS.plannedClosure);

    for (const hub of ["union", "kitchener", "allandale-waterfront", "durham-college-oshawa", "niagara-falls", "pearson-airport"]) {
      assert.ok(REGIONAL_MAJOR_STATIONS.has(hub), `Major station ${hub} missing from regional hubs set`);
    }
  });

  it("discloses required public transit attributions", () => {
    const ttcAttr = getGeographicAttribution("ttc");
    assert.ok(ttcAttr.includes("City of Toronto"));
    const regAttr = getGeographicAttribution("regional");
    assert.ok(regAttr.includes("Metrolinx"));
  });
});
