import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const svg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const css = readAppStylesheet();

describe("regional application map asset", () => {
  it("uses padded bounds and hides authored lakes and labels", () => {
    assert.match(svg, /viewBox="-200 -200 17036\.959 9031\.6719"/);
    assert.match(svg, /id="regional-lakes-layer"[\s\S]{0,200}style="[^"]*display:none/);
  });

  it("keeps logical junction groups and route-specific child anchors", () => {
    for (const id of [
      "station-weston", "station-weston-ki", "station-weston-up",
      "station-mount-dennis", "station-mount-dennis-ki", "station-mount-dennis-up",
      "station-bloor", "station-bloor-ki", "station-bloor-up",
    ]) {
      assert.equal((svg.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1, `${id} should be unique`);
    }
  });

  it("normalizes route paths and uses an unambiguous Stouffville limited-service label", () => {
    assert.match(svg, /id="regional-route-ki-path"/);
    assert.match(svg, /id="regional-route-up-path"/);
    assert.match(svg, /id="regional-route-up-airport-path"/);
    assert.match(svg, /inkscape:label="service-pattern-stouffville-limited"/);
    assert.doesNotMatch(svg, /inkscape:label="service-pattern-st-limited"/);
  });

  it("keeps each UP route metric on one continuous authored subpath", () => {
    for (const id of ["regional-route-up-path", "regional-route-up-airport-path"]) {
      const path = svg.match(new RegExp(`<path(?=[^>]*id="${id}")[^>]*>`))?.[0];
      assert.ok(path, `${id} should exist`);
      const pathData = path.match(/\sd="([^"]+)"/)?.[1] ?? "";
      assert.equal(
        (pathData.match(/[Mm]/g) ?? []).length,
        1,
        `${id} must not contain a getPointAtLength discontinuity`,
      );
    }
  });

  it("keeps the authored TTC-weight regional corridor strokes", () => {
    for (const id of [
      "regional-route-br-path",
      "regional-route-ki-path",
      "regional-route-up-path",
      "regional-route-up-airport-path",
      "regional-route-mi-path",
      "regional-route-lw-main-path",
      "regional-route-lw-branch-path",
      "regional-route-rh-path",
      "regional-route-st-path",
      "regional-route-le-path",
    ]) {
      assert.match(
        svg,
        new RegExp(`<path(?=[^>]*id="${id}")(?=[^>]*stroke-width:175(?:;|"))[^>]*>`),
        `${id} should retain the authored 175-unit stroke`,
      );
    }
  });

  it("derives segment overlays from the current authored route paths instead of stale imported guides", () => {
    assert.match(svg, /id="regional-segment-guides-layer"[^>]*display:none/);
    assert.doesNotMatch(svg, /id="segment-guide-/);
    assert.match(
      readFileSync(new URL("../../scripts/prepare-regional-map.mjs", import.meta.url), "utf8"),
      /never inject[\s\S]*coordinate snapshots from a previous authored map revision/,
    );
  });

  it("loads the authored TeX Gyre Heros Regular and Bold faces in the browser", () => {
    assert.ok(existsSync(new URL("../public/assets/fonts/texgyreheros-regular.woff2", import.meta.url)));
    assert.ok(existsSync(new URL("../public/assets/fonts/texgyreheros-bold.woff2", import.meta.url)));
    assert.match(css, /@font-face\s*{[^}]*font-family:\s*"TeX Gyre Heros"[^}]*texgyreheros-regular\.woff2[^}]*font-weight:\s*400/s);
    assert.match(css, /@font-face\s*{[^}]*font-family:\s*"TeX Gyre Heros"[^}]*texgyreheros-bold\.woff2[^}]*font-weight:\s*700/s);
  });

  it("preserves authored regular weight and thick outlines on miscellaneous station labels", () => {
    for (const stationName of ["Kipling", "Exhibition", "Downsview Park", "Oriole"]) {
      assert.match(
        svg,
        new RegExp(`style="[^"]*font-weight:normal[^"]*stroke-width:5[^"]*"[^>]*>${stationName}<\\/tspan>`),
        `${stationName} should retain its authored regular weight and 5px text outline`,
      );
    }
  });

  it("imports the latest authored Guildwood VIA spacing without replacing application IDs", () => {
    assert.match(
      svg,
      /<g(?=[^>]*inkscape:label="via-rail-guildwood")(?=[^>]*transform="matrix\(4\.9200533,0,0,4\.9200533,-9995\.2346,-12385\.845\)")[^>]*>/,
    );
    assert.match(svg, /id="regional-route-le-path"/);
    assert.match(svg, /id="regional-stations-layer"/);
  });

  it("does not permanently promote the regional SVG to a composited transform layer", () => {
    assert.doesNotMatch(css, /(?:^|\n)\.regional-map-stage\s*{[^}]*will-change:\s*transform/s);
    assert.doesNotMatch(css, /\.regional-map-camera-moving \.regional-map-stage[^{]*{[^}]*will-change:\s*transform/s);
    assert.match(css, /\.regional-map-stage > svg,[\s\S]*?\.regional-map-stage > div > svg\s*{[^}]*shape-rendering:\s*geometricPrecision/s);
    assert.doesNotMatch(css, /data-regional-map-camera-moving[^}]*shape-rendering:\s*auto/s);
  });

  it("keeps authored corridor colours unchanged while making labels readable in dark mode", () => {
    assert.doesNotMatch(css, /\.dark \.regional-map-stage > svg\s*{[^}]*filter:/s);
    assert.match(css, /\.dark \.regional-map-stage #regional-station-labels-layer :is\(text, tspan\)[^{]*{[^}]*fill:\s*#f8fafc\s*!important/s);
    assert.match(svg, /<path(?=[^>]*id="regional-route-lw-main-path")(?=[^>]*style="[^"]*stroke:#8b0a31)[^>]*>/);
  });

  it("preserves the authored TTC interchange line-number badges", () => {
    assert.equal((svg.match(/inkscape:label="line-[125]"/g) ?? []).length, 6);
    assert.doesNotMatch(svg, /class="regional-ttc-line-badge"/);
    assert.doesNotMatch(css, /\.regional-ttc-line-badge/);
  });

  it("colors the LW-DIV divider to match background across light, dark, and high-contrast themes", () => {
    assert.match(svg, /id="regional-route-lw-div"[^>]*inkscape:label="LW-DIV"/);
    assert.match(css, /\.dark \.regional-map-stage :is\(#regional-route-lw-div, \[inkscape\\:label="LW-DIV"\]\)\s*{[^}]*stroke:\s*#0d0808\s*!important/s);
    assert.match(css, /\.high-contrast \.regional-map-stage :is\(#regional-route-lw-div, \[inkscape\\:label="LW-DIV"\]\)[^{]*{[^}]*stroke:\s*#000000\s*!important/s);
  });

  it("renders join-rectangle interchange connectors with white fill and black stroke", () => {
    assert.equal((svg.match(/inkscape:label="join-rectangle"/g) ?? []).length, 6);
    assert.doesNotMatch(css, /\.regional-map-stage \[inkscape\\:label="join-rectangle"\]/);
    const joinRectangles = [...svg.matchAll(/<rect(?=[^>]*inkscape:label="join-rectangle")[^>]*>/g)].map((match) => match[0]);
    assert.equal(joinRectangles.length, 6);
    assert.ok(joinRectangles.every((rectangle) => /fill:#ffffff/.test(rectangle)));
    assert.ok(joinRectangles.every((rectangle) => /stroke:#000000/.test(rectangle)));
    assert.ok(joinRectangles.every((rectangle) => /stroke-width:10(?:;|")/.test(rectangle)));
  });

  it("removes white stroke outlines from transit route-label badges", () => {
    assert.match(css, /\.regional-map-stage #regional-route-labels-layer rect\s*{[^}]*stroke:\s*none\s*!important;/s);
    assert.match(
      readFileSync(new URL("../scripts/generate-map-rasters.mjs", import.meta.url), "utf8"),
      /#regional-route-labels-layer rect \{ stroke: none !important; \}/,
    );
  });

  it("keeps the Billy Bishop label readable in dark raster themes", () => {
    assert.match(
      readFileSync(new URL("../scripts/generate-map-rasters.mjs", import.meta.url), "utf8"),
      /#g6 text,[\s\S]*?#g6 tspan \{ fill: #f8fafc !important;/,
    );
  });
});
