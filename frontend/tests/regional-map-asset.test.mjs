import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

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
    assert.match(svg, /inkscape:label="service-pattern-stouffville-limited"/);
    assert.doesNotMatch(svg, /inkscape:label="service-pattern-st-limited"/);
  });

  it("keeps the authored TTC-weight regional corridor strokes", () => {
    for (const id of [
      "regional-route-br-path",
      "regional-route-ki-path",
      "regional-route-up-path",
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

  it("contains explicit route-specific guide geometry for supported fixture segments", () => {
    assert.match(svg, /id="regional-segment-guides-layer"[^>]*display:none/);
    assert.match(svg, /id="segment-guide-ki-bloor-mount-dennis"/);
    assert.match(
      svg,
      /id="segment-guide-ki-weston-etobicoke-north" d="M 3428\.5664,2278\.2556 L 2987\.0609,2023\.1482 H 2845\.6543"/,
    );
    assert.match(svg, /id="segment-guide-up-bloor-mount-dennis"/);
    assert.match(svg, /id="segment-guide-up-weston-pearson-airport"/);
    // Other corridors intentionally resolve adjacent stations against their
    // authored route paths at runtime instead of falling back to straight
    // station-center chords.
    assert.doesNotMatch(svg, /id="segment-guide-lw-/);
    assert.doesNotMatch(svg, /id="segment-guide-le-pickering-ajax"/);
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
  });
});
