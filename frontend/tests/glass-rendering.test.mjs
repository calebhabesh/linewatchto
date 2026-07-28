import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const dynamicBackgroundSource = readFileSync(new URL("../src/components/DynamicBackground.tsx", import.meta.url), "utf8");
const constellationSource = readFileSync(new URL("../src/components/ConstellationBackground.tsx", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const activeAlertsSource = readFileSync(new URL("../src/components/ActiveAlertsPanel.tsx", import.meta.url), "utf8");
const plannedClosuresSource = readFileSync(new URL("../src/components/PlannedClosuresPanel.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const reliabilitySource = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
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
    assert.match(constellationSource, /requestAnimationFrame\(draw\)/);
    assert.match(constellationSource, /pointermove/);
    assert.doesNotMatch(dynamicBackgroundSource, /import\("three"\)/);
    assert.doesNotMatch(dynamicBackgroundSource, /vanta/i);
    assert.equal(packageJson.devDependencies.vanta, undefined);
    assert.equal(packageJson.devDependencies.three, undefined);
    assert.equal(packageJson.devDependencies["@types/three"], undefined);
  });

  it("lets users replace the constellation with a plain black or white background", () => {
    assert.match(shellSource, /dotBackgroundEnabled/);
    assert.match(shellSource, /<DynamicBackground[^>]*disabled=\{!dotBackgroundEnabled\}/s);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain/);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain-dark/);
    assert.match(dynamicBackgroundSource, /linewatch-backdrop--plain-light/);
    assert.match(globalCss, /\.linewatch-backdrop--plain-dark\s*\{[^}]*background-color:\s*#000000;/s);
    assert.match(globalCss, /\.linewatch-backdrop--plain-light\s*\{[^}]*background-color:\s*#ffffff;/s);
  });

  it("keeps the constellation visible but non-interactive when motion is reduced", () => {
    assert.match(dynamicBackgroundSource, /if \(disabled\)/);
    assert.doesNotMatch(dynamicBackgroundSource, /if \(reducedMotion \|\| disabled\)/);
    assert.match(dynamicBackgroundSource, /interactive=\{!reducedMotion\}/);
    assert.match(constellationSource, /if \(interactive\) frameId = window\.requestAnimationFrame\(draw\)/);
    assert.match(constellationSource, /if \(interactive && !isMobile\)/);
    assert.match(constellationSource, /if \(interactive\) \{\s*window\.addEventListener\("pointermove"/s);
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
