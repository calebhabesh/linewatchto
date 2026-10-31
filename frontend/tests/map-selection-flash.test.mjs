import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const introSource = source("../src/components/map-overlays/selection-intro.ts");
const shellSource = source("../src/components/LineWatchShell.tsx");
const maps = {
  ttc: source("../src/components/InteractiveTtcMap.tsx"),
  regional: source("../src/components/InteractiveRegionalMap.tsx"),
};

describe("map selection flash", () => {
  it("draws the selected alert's flash above hover copies on both maps, so hovering never hides it", () => {
    for (const [map, mapSource] of Object.entries(maps)) {
      const hoverCopies = mapSource.indexOf("<MapLineAlertHoverCopies");
      const selection = mapSource.indexOf("<MapLineAlertSelection");
      assert.ok(hoverCopies > 0 && selection > hoverCopies, `${map}: selection after hover copies`);
    }
  });

  it("ends the intro when its CSS animation finishes, so a pan or zoom cannot cut it short", () => {
    assert.match(introSource, /animation\.animationName\.endsWith\("-intro"\)/);
    assert.match(introSource, /Promise\.all\(intros\.map\(\(animation\) => animation\.finished\)\)\.then\(complete, complete\)/);
    // With nothing animating (reduced motion, phones), a timer ends it.
    assert.match(introSource, /let timer = window\.setTimeout\(complete, MAP_SELECTION_INTRO_MS\);/);
    assert.match(maps.ttc, /useMapSelectionIntro\([\s\S]*?\}\), mapRootRef\);/);
    assert.match(maps.regional, /useMapSelectionIntro\(selectionIntroKey, regionalMapRef\)/);
  });

  it("keeps the flash and camera when the selected alert is pressed again on the map", () => {
    const handler = shellSource.slice(shellSource.indexOf("const handleMapSelectImpact"));
    assert.match(
      handler.slice(0, 900),
      /if \(nextSelection && selection && nextSelection\.kind === selection\.kind && nextSelection\.id === selection\.id\) \{[\s\S]*?return;/,
    );
  });
});
