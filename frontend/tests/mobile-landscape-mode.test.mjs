import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MOBILE_VIEWPORT_QUERY } from "../src/hooks/useMobilePerformanceMode.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
const hookSource = readFileSync(new URL("../src/hooks/useMobilePerformanceMode.ts", import.meta.url), "utf8");

describe("mobile landscape viewport mode", () => {
  it("defines a unified mobile viewport query covering portrait and landscape phones", () => {
    assert.equal(
      MOBILE_VIEWPORT_QUERY,
      "(max-width: 767px), (orientation: landscape) and (max-height: 520px)",
    );
    assert.match(hookSource, /export const MOBILE_VIEWPORT_QUERY/);
    assert.match(hookSource, /export function isMobileViewportMatches/);
  });

  it("uses MOBILE_VIEWPORT_QUERY to synchronize isMobile in the app shell", () => {
    assert.match(shellSource, /import\s*\{[^}]*MOBILE_VIEWPORT_QUERY[^}]*\}\s*from\s*["']\.\.\/hooks\/useMobilePerformanceMode["']/);
    assert.match(shellSource, /window\.matchMedia\(MOBILE_VIEWPORT_QUERY\)/);
  });

  it("resets software rotated mode when entering physical landscape orientation", () => {
    assert.match(
      shellSource,
      /const isPhysicalLandscape = typeof window !== "undefined" && window\.matchMedia\("\s*\(orientation: landscape\) and \(max-height: 520px\)\s*"\)\.matches;/,
    );
    assert.match(
      shellSource,
      /if \(\(!isMobile \|\| isPhysicalLandscape\) && mapPresentationMode !== "standard"\)/,
    );
    assert.match(
      shellSource,
      /const orientationQuery = window\.matchMedia\("\(orientation: landscape\)"\);/,
    );
  });

  it("hides the software Rotate Map button in physical landscape mode", () => {
    assert.match(
      globalCss,
      /\.rotate-map-btn\s*\{[^}]*display:\s*none\s*!important;/s,
    );
  });

  it("displays the mobile bottom navigation in landscape on phone viewports", () => {
    assert.match(
      globalCss,
      /@media \(max-width: 400px\), \(orientation: landscape\) and \(max-height: 520px\)\s*\{[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*display:\s*grid\s*!important;/s,
    );
  });

  it("preserves bottom sheet layout for station detail panels in mobile landscape", () => {
    assert.match(
      globalCss,
      /\.station-sheet-drag-handle-container\s*\{[^}]*display:\s*flex\s*!important;/s,
    );
    assert.match(
      globalCss,
      /\.station-detail-panel\s*\{[^}]*bottom:\s*0\s*!important;[^}]*left:\s*0\s*!important;[^}]*right:\s*0\s*!important;[^}]*top:\s*auto\s*!important;[^}]*width:\s*100%\s*!important;/s,
    );
  });
});
