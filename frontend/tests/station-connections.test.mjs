import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INTER_NETWORK_CONNECTIONS,
  regionalStationConnections,
  ttcStationIdForRegionalStation,
  ttcStationConnections,
} from "../src/app/station-connections.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const ttcMap = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-custom.svg", import.meta.url),
  "utf8",
);
const regionalMap = readFileSync(
  new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url),
  "utf8",
);
const regionalAssetSource = readFileSync(
  new URL("../src/app/regional-map-asset.ts", import.meta.url),
  "utf8",
);
const regionalOverlaysSource = readFileSync(
  new URL("../src/app/regional-map-overlays.ts", import.meta.url),
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
const css = readAppStylesheet();

describe("station connection metadata and map labels", () => {
  it("records reviewed TTC to GO/UP station pairs as reusable product data", () => {
    assert.deepEqual(
      INTER_NETWORK_CONNECTIONS.find((connection) => connection.ttcStationId === "dundas-west"),
      { ttcStationId: "dundas-west", regionalStationId: "bloor", services: ["go", "up"] },
    );
    assert.deepEqual(
      ttcStationConnections("union").map((connection) => ({ kind: connection.kind, detail: connection.detail })),
      [
        { kind: "go", detail: "All GO Lines" },
        { kind: "via", detail: "Intercity Rail Connection" },
        { kind: "up", detail: "Union Station" },
      ],
    );
    assert.deepEqual(
      ttcStationConnections("kipling"),
      [{ kind: "go", label: "GO Transit", detail: "Milton Line" }],
    );
    assert.deepEqual(
      ttcStationConnections("downsview-park"),
      [{ kind: "go", label: "GO Transit", detail: "Barrie Line" }],
    );
    assert.deepEqual(
      ttcStationConnections("kennedy"),
      [{ kind: "go", label: "GO Transit", detail: "Stouffville Line" }],
    );
    assert.deepEqual(
      ttcStationConnections("main-street"),
      [{ kind: "go", label: "GO Transit", detail: "Lakeshore East Line" }],
    );
    assert.deepEqual(
      ttcStationConnections("leslie"),
      [{ kind: "go", label: "GO Transit", detail: "Richmond Hill Line" }],
    );
    assert.deepEqual(
      ttcStationConnections("dundas-west"),
      [
        { kind: "go", label: "GO Transit", detail: "Kitchener Line" },
        { kind: "up", label: "UP Express", detail: "Bloor" },
      ],
    );
    assert.deepEqual(
      ttcStationConnections("mount-dennis"),
      [
        { kind: "go", label: "GO Transit", detail: "Kitchener Line" },
        { kind: "up", label: "UP Express", detail: "Mount Dennis" },
      ],
    );
    assert.equal(ttcStationIdForRegionalStation("bloor"), "dundas-west");
    assert.equal(ttcStationIdForRegionalStation("danforth"), "main-street");
  });

  it("records VIA Rail, airport, and TTC connections for regional station details", () => {
    assert.deepEqual(
      regionalStationConnections("union").map((connection) => connection.label),
      ["VIA Rail", "Billy Bishop Airport", "TTC · Line 1"],
    );
    assert.deepEqual(
      regionalStationConnections("pearson-airport").map((connection) => connection.label),
      ["Pearson Airport"],
    );
    assert.deepEqual(
      regionalStationConnections("guildwood").map((connection) => connection.kind),
      ["via"],
    );
    assert.deepEqual(
      regionalStationConnections("kipling").map((connection) => ({ label: connection.label, detail: connection.detail })),
      [{ label: "TTC · Line 2", detail: "Bloor-Danforth" }],
    );
    assert.deepEqual(
      regionalStationConnections("kennedy").map((connection) => ({ label: connection.label, detail: connection.detail })),
      [
        { label: "TTC · Line 2", detail: "Bloor-Danforth" },
        { label: "TTC · Line 5", detail: "Eglinton Crosstown" },
      ],
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
    assert.match(regionalAssetSource, /element\.classList\.add\("map-connection-label"\)/);
    assert.match(regionalOverlaysSource, /querySelectorAll<SVGGraphicsElement>\("\.map-connection-label"\)/);
  });

  it("integrates connection badges into both station panels and both themes", () => {
    assert.match(ttcStationPanel, /<StationConnectionBadges connections=\{connections\}/);
    assert.match(regionalStationPanel, /<StationConnectionBadges connections=\{connections\}/);
    assert.match(ttcStationPanel, /station-detail-section-stack/);
    assert.match(regionalStationPanel, /station-detail-section-stack/);
    assert.match(ttcStationPanel, /flex flex-1 min-h-0 flex-col gap-3[^"\n]*mt-2 pb-3/);
    assert.match(regionalStationPanel, /flex flex-1 min-h-0 flex-col gap-3[^"\n]*mt-2 pb-3/);
    assert.match(css, /\.station-connections-title/);
    assert.match(connectionBadges, /GitMerge/);
    assert.match(connectionBadges, /connections\.length === 1 \? "Connected Network" : "Connected Networks"/);
    assert.match(connectionBadges, /station-connection-dot-sep/);
    assert.match(
      connectionBadges,
      /className="[^"]*station-connections-card[^"]*rounded-lg border border-black\/10 bg-slate-50 p-3 dark:border-white\/10 dark:bg-white\/5/,
    );
    assert.doesNotMatch(css, /\.station-connections-card[^}]*?(?:border|background|padding):/s);
    assert.match(css, /\.dark \.station-connections-title,[\s\S]*?color: #f8fafc/);
    assert.match(css, /\.station-connections-card[^}]*gap: 6px/s);
    assert.match(css, /\.station-connections-title[^}]*margin: 0;/s);
    assert.match(css, /\.station-connection-dot-sep[^}]*margin: 0 6px;/s);
    assert.match(css, /\.station-connection-list[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    assert.doesNotMatch(css, /\.station-connection-row:last-child:nth-child\(odd\)/);
    assert.doesNotMatch(css, /\.station-connection-row:only-child/);
    assert.match(css, /\.dark \.station-connection-row,[\s\S]*?background: rgba\(255, 255, 255, 0\.035\)/);
    assert.doesNotMatch(css, /map-connection-airport[^}]*filter:/s);
    assert.match(css, /map-connection-airport :is\(text, tspan\)[\s\S]*?fill: #f8fafc !important/);
    assert.match(upExpressLogo, /fill:#4084cd/g);
    assert.match(ttcMap, /id="path40-9-51"[\s\S]*?style="fill:#4084cd/);
    assert.match(ttcMap, /id="path40-9-5"[\s\S]*?style="fill:#4084cd/);
    assert.match(ttcMap, /id="path40-9"[\s\S]*?style="fill:#4084cd/);
    assert.match(css, /\[inkscape\\:label="mount-dennis-up"\][\s\S]*?fill: #4084cd !important/);
    assert.match(css, /\[inkscape\\:label="mount-dennis-up"\]/);
    assert.match(
      regionalMap,
      /id="regional-route-labels-layer"[\s\S]*?transform="translate\(-4111\.7654,-199\.90753\)"[\s\S]*?inkscape:label="via-rail-union"/,
    );
  });
});
