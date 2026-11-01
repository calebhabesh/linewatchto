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
