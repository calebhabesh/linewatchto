import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const dynamicBackgroundSource = readFileSync(new URL("../src/components/DynamicBackground.tsx", import.meta.url), "utf8");
const constellationSource = readFileSync(new URL("../src/components/ConstellationBackground.tsx", import.meta.url), "utf8");
const pageVisibilitySource = readFileSync(new URL("../src/hooks/usePageVisibility.ts", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const activeAlertsSource = readFileSync(new URL("../src/components/ActiveAlertsPanel.tsx", import.meta.url), "utf8");
const plannedClosuresSource = readFileSync(new URL("../src/components/PlannedClosuresPanel.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const reliabilitySource = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function alphaForVariable(selector, variableName) {
  const blockMatch = globalCss.match(new RegExp(`${selector}\\s*\\{(?<body>[^}]+)\\}`));
  assert.ok(blockMatch?.groups?.body, `Missing CSS block for ${selector}`);

  const variableMatch = blockMatch.groups.body.match(
    new RegExp(`${variableName}:\\s*rgba\\([^,]+,[^,]+,[^,]+,\\s*(?<alpha>\\d*\\.?\\d+)\\)`)
  );
  assert.ok(variableMatch?.groups?.alpha, `Missing ${variableName} alpha in ${selector}`);

  return Number(variableMatch.groups.alpha);
}

describe("frosted glass rendering", () => {
  it("defines panel variables on the active shell so legacy panel classes keep a real translucent fill", () => {
    assert.match(shellSource, /linewatch-shell/);
    assert.match(globalCss, /\.linewatch-shell\s*\{/);
    assert.match(globalCss, /--panel:\s*rgba\(/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{/);
  });

  it("renders a dependency-free constellation background with a CSS fallback layer", () => {
    assert.match(dynamicBackgroundSource, /linewatch-backdrop/);
    assert.match(globalCss, /\.linewatch-backdrop\s*\{/);
    assert.match(dynamicBackgroundSource, /ConstellationBackground/);
    assert.match(constellationSource, /CONNECTION_DISTANCE/);
    assert.match(constellationSource, /MOBILE_NODE_SPACING/);
    assert.match(constellationSource, /MOBILE_CONNECTION_DISTANCE/);
    assert.match(constellationSource, /const drift = isMobile \? 0\.07 : 0\.12/);
    assert.match(constellationSource, /requestAnimationFrame\(draw\)/);
    assert.match(constellationSource, /pointermove/);
    assert.doesNotMatch(dynamicBackgroundSource, /import\("three"\)/);
    assert.doesNotMatch(dynamicBackgroundSource, /vanta/i);
    assert.equal(packageJson.devDependencies.vanta, undefined);
    assert.equal(packageJson.devDependencies.three, undefined);
    assert.equal(packageJson.devDependencies["@types/three"], undefined);
  });

  it("lets users replace the constellation with the static base background", () => {
    assert.match(shellSource, /dotBackgroundEnabled/);
    assert.match(shellSource, /<DynamicBackground[^>]*disabled=\{!dotBackgroundEnabled\}/s);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain/);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain-dark/);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain-light/);
    assert.match(globalCss, /\.linewatch-backdrop--plain-dark\s*\{[^}]*background-color:\s*var\(--map-canvas-bg,\s*#0e1622\);/s);
    assert.match(globalCss, /\.linewatch-backdrop--plain-light\s*\{[^}]*background-color:\s*var\(--map-canvas-bg,\s*#f8fafc\);/s);
  });

  it("uses the shared constellation preference label on desktop and mobile", () => {
    assert.match(shellSource, /BACKGROUND_PREFERENCE_LABEL/);
    assert.match(mobileMoreSource, /BACKGROUND_PREFERENCE_LABEL/);
    assert.doesNotMatch(mobileMoreSource, /Dot Background/);
  });

  it("keeps the constellation visible but non-interactive when motion is reduced", () => {
    assert.match(dynamicBackgroundSource, /if \(disabled\)/);
    assert.doesNotMatch(dynamicBackgroundSource, /if \(reducedMotion \|\| disabled\)/);
    assert.match(dynamicBackgroundSource, /interactive=\{!reducedMotion\}/);
    assert.match(constellationSource, /if \(interactive && !isMobile\)/);
    assert.match(constellationSource, /if \(interactive\) \{\s*window\.addEventListener\("pointermove"/s);
  });

  it("reallocates the constellation canvas and restarts one clean loop after PWA resume", () => {
    assert.match(constellationSource, /const resetCanvas = \(recreateNodes: boolean\) =>/);
    assert.match(constellationSource, /canvas\.width = Math\.round\(width \* pixelRatio\)/);
    assert.match(constellationSource, /context\.setTransform\(1, 0, 0, 1, 0, 0\);\s*context\.clearRect\(0, 0, canvas\.width, canvas\.height\)/s);
    assert.match(constellationSource, /const stop = \(\) => \{[\s\S]*?cancelAnimationFrame\(frameId\)/);
    assert.match(constellationSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(constellationSource, /window\.addEventListener\("pagehide", handlePageHide\)/);
    assert.match(constellationSource, /window\.addEventListener\("pageshow", resetAfterResume\)/);
    assert.match(constellationSource, /window\.addEventListener\("focus", resetAfterResume\)/);
    assert.match(constellationSource, /document\.addEventListener\("resume", resetAfterResume\)/);
    assert.match(constellationSource, /lifecycleForeground = true;\s*stop\(\);\s*resetCanvas\(false\);\s*start\(\)/s);
    assert.match(constellationSource, /resetAfterResume[\s\S]*?resetCanvas\(false\);\s*start\(\)/);
  });

  it("shares foreground visibility with map animation owners", () => {
    assert.match(pageVisibilitySource, /document\.addEventListener\("visibilitychange", synchronizeVisibility\)/);
    assert.match(pageVisibilitySource, /window\.addEventListener\("pagehide", handlePageHide\)/);
    assert.match(pageVisibilitySource, /window\.addEventListener\("pageshow", handleForeground\)/);
    assert.match(pageVisibilitySource, /window\.addEventListener\("focus", handleForeground\)/);
    assert.match(pageVisibilitySource, /document\.addEventListener\("resume", handleForeground\)/);
  });

  it("does not use live backdrop blur on interactive panels", () => {
    for (const source of [
      shellSource,
      interactiveMapSource,
      activeAlertsSource,
      plannedClosuresSource,
      savedCommutesSource,
      reliabilitySource,
    ]) {
      assert.doesNotMatch(source, /backdrop-blur/);
      assert.doesNotMatch(source, /backdropFilter/);
      assert.doesNotMatch(source, /WebkitBackdropFilter/);
    }
  });

  it("keeps primary panel fills opaque enough for readable text", () => {
    assert.ok(alphaForVariable("\\.linewatch-shell", "--panel") >= 0.85);
    assert.ok(alphaForVariable("\\.linewatch-shell\\.dark", "--panel") >= 0.85);

    for (const source of [
      shellSource,
      interactiveMapSource,
      activeAlertsSource,
      plannedClosuresSource,
      savedCommutesSource,
      reliabilitySource,
    ]) {
      assert.doesNotMatch(source, /bg-white\/90/);
      assert.doesNotMatch(source, /dark:bg-\[#(?:0a0c10|12151c)\]\/90/);
    }
  });
});
