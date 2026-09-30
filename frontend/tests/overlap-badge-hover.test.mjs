import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const mapSource = readFileSync(
  new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url),
  "utf8",
);
const overlapIndicatorSource = readFileSync(
  new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url),
  "utf8",
);

describe("desktop overlap badge hover", () => {
  it("emphasizes every segment and station impact represented by the hovered badge", () => {
    assert.match(mapSource, /const setExternalImpactsHovered = useCallback/);
    assert.match(mapSource, /for \(const impact of impacts\)/);
    assert.match(mapSource, /externallyHoveredImpactKeysRef\.current\.add\(impactKey\)/);
    assert.match(mapSource, /setLinkedImpactHover\(\{[\s\S]*?kind: impact\.kind,[\s\S]*?id: impact\.cardId/);
    assert.match(mapSource, /className="ttc-impact-hover-foreground-layer"/);
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
    assert.match(mapSource, /clearMapHover\(\);\s*setExpandedOverlapBadgeId\(badge\.segmentId\)/);
  });
});
