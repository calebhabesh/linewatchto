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
const connectionBadges = readFileSync(
  new URL("../src/components/StationConnectionBadges.tsx", import.meta.url),
  "utf8",
);
const upExpressLogo = readFileSync(
  new URL("../public/assets/linewatch/connections/up-express-logo.svg", import.meta.url),
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
    assert.match(ttcStationPanel, /station-detail-section-stack/);
    assert.match(regionalStationPanel, /station-detail-section-stack/);
    assert.match(ttcStationPanel, /flex flex-1 min-h-0 flex-col gap-3[^"\n]*mt-3 pb-3/);
    assert.match(regionalStationPanel, /flex flex-1 min-h-0 flex-col gap-3[^"\n]*mt-3 pb-3/);
    assert.match(css, /\.station-connections-title/);
    assert.match(connectionBadges, /GitMerge/);
    assert.match(connectionBadges, /connections\.length === 1 \? "Connected Network" : "Connected Networks"/);
    assert.doesNotMatch(css, /\.station-connections-card[^}]*?(?:border|background|padding):/s);
    assert.match(css, /\.dark \.station-connections-title,[\s\S]*?color: #f8fafc/);
    assert.match(css, /\.station-connections-card[^}]*gap: 6px/s);
    assert.match(css, /\.station-connections-title[^}]*margin: 0;/s);
    assert.match(css, /\.station-connection-list[^}]*display: flex;[^}]*width: 100%;[^}]*flex-wrap: wrap;/s);
    assert.match(css, /\.station-connection-row[^}]*border: 1px solid/s);
    assert.match(css, /\.station-connection-row[^}]*width: max-content;[^}]*max-width: 100%/s);
    assert.match(css, /\.dark \.station-connection-row,[\s\S]*?background: rgba\(255, 255, 255, 0\.035\)/);
    assert.doesNotMatch(css, /map-connection-airport[^}]*filter:/s);
    assert.match(css, /map-connection-airport :is\(text, tspan\)[\s\S]*?fill: #f8fafc !important/);
    assert.match(upExpressLogo, /fill:#4084cd/g);
    assert.match(ttcMap, /id="path40-9-51"[\s\S]*?style="fill:#4084cd"/);
    assert.match(ttcMap, /id="path40-9-5"[\s\S]*?style="fill:#4084cd"/);
    assert.match(ttcMap, /id="path40-9"[\s\S]*?style="fill:#4084cd"/);
    assert.match(css, /\[inkscape\\:label="mount-dennis-up"\][\s\S]*?fill: #4084cd !important/);
    assert.match(css, /\[inkscape\\:label="mount-dennis-up"\]/);
    assert.match(
      regionalMap,
      /id="regional-route-labels-layer"[\s\S]*?transform="translate\(-4111\.7654,-199\.90753\)"[\s\S]*?inkscape:label="via-rail-union"/,
    );
  });
});
