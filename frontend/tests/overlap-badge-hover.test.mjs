import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// TTC's renderer with the shared station-alert layer it draws with.
const mapSource = [
  "../src/components/InteractiveTtcMap.tsx",
  "../src/components/map-overlays/StationAlertOverlays.tsx",
  "../src/components/map-overlays/map-hover-controller.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const overlapIndicatorSource = readFileSync(
  new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url),
  "utf8",
);

describe("desktop overlap badge hover", () => {
  it("emphasizes every segment and station impact represented by the hovered badge", () => {
    assert.match(mapSource, /const setExternalImpactsHovered = useCallback/);
    assert.match(mapSource, /hoverControllerRef\.current\?\.setGroupPreview\(/);
    // Previews outline the alerts and light their station rings; they never
    // raise alert artwork the way a direct overlay hover does.
    assert.match(mapSource, /if \(!owner && previewed\.has\(impactKey\(impact\)\)\) \{\s*setMapImpactHovered\(root, impact, true, "station-rings"\);/);
    assert.match(mapSource, /renderMapPreviewOutline\(/);
    assert.match(mapSource, /<MapLineAlertHoverOutlines/);
    assert.match(mapSource, /className="station-impact-hover-priority"/);
    assert.doesNotMatch(mapSource, /activeHoverForegrounds\.map|activeHoverHighlights\.map/);
  });

  it("activates only for mouse pointers while retaining keyboard focus feedback", () => {
    assert.match(overlapIndicatorSource, /event\.pointerType === "mouse"\) onHoverChange\?\.\(true\)/);
    assert.match(overlapIndicatorSource, /event\.pointerType === "mouse"\) onHoverChange\?\.\(false\)/);
    assert.match(overlapIndicatorSource, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/);
    assert.match(overlapIndicatorSource, /onHoverChange\?\.\(true\)/);
    assert.match(overlapIndicatorSource, /onBlur=\{\(\) => onHoverChange\?\.\(false\)\}/);
  });

  it("clears transient badge hover before handing preview ownership to the chooser", () => {
    assert.match(
      overlapIndicatorSource,
      /const activate = \(\) => \{\s*onHoverChange\?\.\(false\);\s*onActivate\(\);\s*\}/,
    );
    assert.match(overlapIndicatorSource, /if \(!open && event\.pointerType === "mouse"\) onHoverChange\?\.\(true\)/);
    assert.match(
      overlapIndicatorSource,
      /if \(!open &&[^{}]*window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/,
    );
    assert.match(mapSource, /clearMapHover\(\);\s*setExpandedOverlapBadgeId\(badge\.markerId\)/);
  });
});
