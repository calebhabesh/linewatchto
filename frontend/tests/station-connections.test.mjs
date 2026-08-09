import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INTER_NETWORK_CONNECTIONS,
  regionalStationConnections,
  ttcStationIdForRegionalStation,
  ttcStationConnections,
} from "../src/app/station-connections.ts";

const ttcMap = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-edited.svg", import.meta.url),
  "utf8",
);
const regionalMap = readFileSync(
  new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url),
  "utf8",
);
const regionalMapSource = readFileSync(
  new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url),
  "utf8",
);
const ttcStationPanel = readFileSync(
  new URL("../src/components/StationDetailPanel.tsx", import.meta.url),
  "utf8",
);
const regionalStationPanel = readFileSync(
  new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station connection metadata and map labels", () => {
  it("records reviewed TTC to GO/UP station pairs as reusable product data", () => {
    assert.deepEqual(
      INTER_NETWORK_CONNECTIONS.find((connection) => connection.ttcStationId === "dundas-west"),
      { ttcStationId: "dundas-west", regionalStationId: "bloor", services: ["go", "up"] },
    );
    assert.deepEqual(
      ttcStationConnections("union").map((connection) => connection.kind),
      ["go", "via", "up"],
    );
    assert.deepEqual(
      ttcStationConnections("kennedy").map((connection) => connection.kind),
      ["go"],
    );
    assert.equal(ttcStationIdForRegionalStation("bloor"), "dundas-west");
    assert.equal(ttcStationIdForRegionalStation("danforth"), "main-street");
  });

  it("records VIA Rail and airport connections for regional station details", () => {
    assert.deepEqual(
      regionalStationConnections("union").map((connection) => connection.label),
      ["VIA Rail", "Billy Bishop Airport"],
    );
    assert.deepEqual(
      regionalStationConnections("pearson-airport").map((connection) => connection.label),
      ["Pearson Airport"],
    );
    assert.deepEqual(
      regionalStationConnections("guildwood").map((connection) => connection.kind),
      ["via"],
    );
  });

  it("ships the authored connection artwork in both current map assets", () => {
    assert.match(ttcMap, /inkscape:label="union-go-via-up"/);
    assert.match(ttcMap, /inkscape:label="go-up-logo-mount-dennis"/);
    assert.match(ttcMap, /inkscape:label="go-logo-kennedy"/);
    assert.match(regionalMap, /inkscape:label="via-rail-guildwood"/);
    assert.match(regionalMap, /inkscape:label="pearson-airport-icon"/);
    assert.match(regionalMap, /inkscape:label="billy-bishop-airport-icon"/);
  });

  it("marks non-text connection artwork as collision keepouts", () => {
    assert.match(regionalMapSource, /element\.classList\.add\("map-connection-label"\)/);
    assert.match(regionalMapSource, /querySelectorAll<SVGGraphicsElement>\("\.map-connection-label"\)/);
  });

  it("integrates connection badges into both station panels and both themes", () => {
    assert.match(ttcStationPanel, /<StationConnectionBadges connections=\{connections\}/);
    assert.match(regionalStationPanel, /<StationConnectionBadges connections=\{connections\}/);
    assert.match(css, /\.station-connections-title/);
    assert.match(css, /\.dark \.station-connection-row--up \.station-connection-icon/);
    assert.match(css, /\.dark \.station-connection-row--airport \.station-connection-icon/);
    assert.match(css, /\[inkscape\\:label="mount-dennis-up"\]/);
    assert.match(
      regionalMap,
      /id="regional-route-labels-layer"[\s\S]*?transform="translate\(-4111\.7654,-199\.90753\)"[\s\S]*?inkscape:label="via-rail-union"/,
    );
  });
});
