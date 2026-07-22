import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("regional application map asset", () => {
  it("uses padded bounds and hides authored lakes and labels", () => {
    assert.match(svg, /viewBox="-200 -200 15797\.607 8722\.7246"/);
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
    assert.match(svg, /inkscape:label="service-pattern-stouffville-limited"/);
    assert.doesNotMatch(svg, /inkscape:label="service-pattern-st-limited"/);
  });

  it("contains explicit route-specific guide geometry for supported fixture segments", () => {
    assert.match(svg, /id="regional-segment-guides-layer"[^>]*display:none/);
    assert.match(svg, /id="segment-guide-ki-weston-mount-dennis"/);
    assert.match(svg, /id="segment-guide-up-weston-pearson-airport"/);
    assert.match(svg, /id="segment-guide-le-pickering-ajax"/);
  });

  it("loads the authored TeX Gyre Heros Bold face in the browser", () => {
    assert.match(css, /@font-face\s*{[^}]*font-family:\s*"TeX Gyre Heros"[^}]*texgyreheros-bold\.woff2[^}]*font-weight:\s*700/s);
  });

  it("does not permanently promote the regional SVG to a composited transform layer", () => {
    assert.doesNotMatch(css, /\.regional-map-stage\s*{[^}]*will-change:\s*transform/s);
  });

  it("keeps authored corridor colours unchanged while making labels readable in dark mode", () => {
    assert.doesNotMatch(css, /\.dark \.regional-map-stage > svg\s*{[^}]*filter:/s);
    assert.match(css, /\.dark \.regional-map-stage #regional-station-labels-layer :is\(text, tspan\)[^{]*{[^}]*fill:\s*#f8fafc\s*!important/s);
    assert.match(svg, /<path(?=[^>]*id="regional-route-lw-main-path")(?=[^>]*style="[^"]*stroke:#8b0a31)[^>]*>/);
  });

  it("removes outer outline ring on TTC interchange line-number badges", () => {
    assert.equal((svg.match(/class="regional-ttc-line-badge"/g) ?? []).length, 6);
    assert.match(css, /\.regional-ttc-line-badge > path:first-of-type\s*{[^}]*display:\s*none\s*!important/s);
  });

  it("colors the LW-DIV divider to match background across light, dark, and high-contrast themes", () => {
    assert.match(svg, /id="regional-route-lw-div"[^>]*inkscape:label="LW-DIV"/);
    assert.match(css, /\.dark \.regional-map-stage :is\(#regional-route-lw-div, \[inkscape\\:label="LW-DIV"\]\)\s*{[^}]*stroke:\s*#0d0808\s*!important/s);
    assert.match(css, /\.high-contrast \.regional-map-stage :is\(#regional-route-lw-div, \[inkscape\\:label="LW-DIV"\]\)[^{]*{[^}]*stroke:\s*#000000\s*!important/s);
  });

  it("renders join-rectangle interchange connectors with white fill and black stroke", () => {
    assert.equal((svg.match(/inkscape:label="join-rectangle"/g) ?? []).length, 6);
    assert.match(css, /\.regional-map-stage \[inkscape\\:label="join-rectangle"\]\s*{[^}]*fill:\s*#ffffff\s*!important;[^}]*stroke:\s*#000000\s*!important;/s);
  });

  it("removes white stroke outlines from transit route-label badges", () => {
    assert.match(css, /\.regional-map-stage #regional-route-labels-layer rect\s*{[^}]*stroke:\s*none\s*!important;/s);
  });
});
