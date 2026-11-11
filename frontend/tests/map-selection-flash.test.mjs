import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readRegionalMapSource, readTtcMapSource } from "./helpers/map-source.mjs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const introSource = source("../src/components/map-overlays/selection-intro.ts");
const shellSource = source("../src/components/LineWatchShell.tsx");
const maps = {
  ttc: readTtcMapSource(),
  regional: readRegionalMapSource(),
};

describe("map selection flash", () => {
  it("draws hover copies above the selection's flash, except the selected alert's own copy", () => {
    // Another alert hovered over the selection shows in full colour; the
    // flash used to tint it. The selected alert's tube is already raised, so
    // its copy is hidden and hovering it never covers its flash.
    for (const [map, mapSource] of Object.entries(maps)) {
      const hoverCopies = mapSource.indexOf("<MapLineAlertHoverCopies");
      const selection = mapSource.indexOf("<MapLineAlertSelection");
      assert.ok(selection > 0 && hoverCopies > selection, `${map}: hover copies after the selection`);
      assert.match(mapSource, /<MapLineAlertHoverCopies alerts=\{lineAlerts\} plane=\{overlayPlane\} selection=\{settledSelection\} \/>/);
    }
    const overlays = source("../src/components/map-overlays/LineAlertOverlays.tsx");
    assert.match(overlays, /data-map-hover-selected=\{isSelectedLineAlert\(alert, selection\) \? "true" : undefined\}/);
    const css = source("../src/styles/map/map-selection.css");
    assert.match(css, /\.map-impact-hover-foreground\[data-map-hover-selected="true"\] > use\s*\{\s*display: none;/);
  });

  it("hands the intro to breathing without a jump", () => {
    // Finishing the intro adds .selection-intro-complete to the nodes that
    // played it, whose breathe keeps running. Its delay must move by exactly
    // one breathe cycle (there and back): a 0s delay after a 1.2s intro
    // jumped the breathe from its trough to its peak.
    const themes = source("../src/styles/foundation/themes.css");
    assert.match(themes, /--selection-breathe-duration: 1\.2s;/);
    assert.match(themes, /--selection-intro-duration: 2s;/);
    assert.match(introSource, /export const MAP_SELECTION_INTRO_MS = 2000;/);
    const css = source("../src/styles/map/map-selection.css");
    assert.match(css, /\.map-selection-attention\.selection-intro-complete \{[^}]*animation-delay: calc\(var\(--selection-intro-duration\) - 2 \* var\(--selection-breathe-duration\)\);/);
    // The band is the alert tube's width and only its opacity animates, so a
    // selected alert brightens but its edge never moves (a wider band whose
    // width and glow pulsed made selecting look like the alert grew).
    const tube = source("../src/styles/map/impact-overlays.css").match(/\n\.asset-alert-path \{[^}]*stroke-width: ([^;]+);/)?.[1];
    const band = css.match(/\n\.asset-alert-path\.map-selection-flash \{[^}]*stroke-width: ([^;]+);/)?.[1];
    assert.equal(band, tube);
    // Selecting never resizes the alert's own tube either: a selected planned
    // advisory's rail grew from 96 to 118 units under the flash.
    assert.doesNotMatch(source("../src/styles/map/impact-overlays.css"), /\.asset-alert-path\.selected\s*\{[^}]*stroke-width/);
    for (const name of ["intro", "breathe"]) {
      const block = css.match(new RegExp(`@keyframes map-selection-path-${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      assert.deepEqual([...new Set([...block.matchAll(/([a-z-]+):/g)].map((match) => match[1]))], ["opacity"], name);
    }
    const breatheFrom = css.match(/@keyframes map-selection-path-breathe \{\s*from \{([^}]*)\}/)?.[1] ?? "";
    for (const name of ["path", "station"]) {
      const block = css.match(new RegExp(`@keyframes map-selection-${name}-intro \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      const breathe = css.match(new RegExp(`@keyframes map-selection-${name}-breathe \\{\\s*from \\{([^}]*)\\}`))?.[1] ?? "";
      // It eases in from nothing and ends where the breathe starts.
      assert.match(block, /\b0% \{\s*opacity: 0;/, name);
      const end = block.match(/(?:^|\s)(?:[0-9.]+%, )?100% \{\s*opacity: ([0-9.]+);/)?.[1];
      assert.equal(end, breatheFrom && breathe.match(/opacity: ([0-9.]+)/)?.[1], name);
    }
  });

  it("ends the intro when its CSS animation finishes, so a pan or zoom cannot cut it short", () => {
    assert.match(introSource, /animation\.animationName\.endsWith\("-intro"\)/);
    assert.match(introSource, /Promise\.all\(intros\.map\(\(animation\) => animation\.finished\)\)\.then\(complete, complete\)/);
    // With nothing animating (reduced motion, phones), a timer ends it.
    assert.match(introSource, /let timer = window\.setTimeout\(complete, MAP_SELECTION_INTRO_MS\);/);
    assert.match(maps.ttc, /useMapSelectionIntro\([\s\S]*?\}\), rootRef, undefined, OTHER_SELECTION_INTRO_SCOPE\);/);
  });

  it("plays each line alert's intro with its own flash: the line intro key settles with the selection", () => {
    // The shell's key switches at once; the flash only once the camera lands.
    // Keyed by the shell, the previous alert's flash finished the new key's
    // intro and the new alert went straight to breathing.
    assert.match(maps.ttc, /const settled = useSettledMapSelection\(selection, linkedSelectionIntroKey, isCameraInteracting\);/);
    assert.match(maps.ttc, /useMapSelectionIntro\(settledSelection \? mapSelectionIntroKey\(\{\s*selection: settledSelection,\s*linkedSelectionIntroKey: settled\.introKey,[\s\S]*?LINE_ALERT_INTRO_SCOPE, reportLineIntroStart\);/);
    assert.match(maps.ttc, /<MapLineAlertSelection[\s\S]*?introComplete=\{lineSelectionIntroComplete\}/);
    assert.match(source("../src/components/map-overlays/settled-selection.ts"), /a\.introKey === b\.introKey/);
  });

  it("keeps the flash and camera when the selected alert is pressed again on the map", () => {
    const handler = shellSource.slice(shellSource.indexOf("const handleMapSelectImpact"));
    assert.match(
      handler.slice(0, 900),
      /if \(nextSelection && selection && nextSelection\.kind === selection\.kind && nextSelection\.id === selection\.id\) \{[\s\S]*?return;/,
    );
  });
});
