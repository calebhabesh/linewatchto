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
    assert.match(mapSource, /hoveredOverlapBadge\.impacts\.flatMap/);
    assert.match(mapSource, /activeHoverForegrounds\.map/);
    assert.match(mapSource, /activeHoverHighlights\.map/);
    assert.match(mapSource, /hoveredOverlapStationImpactKeys\.has/);
  });

  it("activates only for mouse pointers while retaining keyboard focus feedback", () => {
    assert.match(overlapIndicatorSource, /event\.pointerType === "mouse"\) onHoverChange\?\.\(true\)/);
    assert.match(overlapIndicatorSource, /event\.pointerType === "mouse"\) onHoverChange\?\.\(false\)/);
    assert.match(overlapIndicatorSource, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/);
    assert.match(overlapIndicatorSource, /onHoverChange\?\.\(true\)/);
    assert.match(overlapIndicatorSource, /onBlur=\{\(\) => onHoverChange\?\.\(false\)\}/);
  });

  it("drops the group highlight when the badge opens its alert chooser", () => {
    assert.match(
      overlapIndicatorSource,
      /const activate = \(\) => \{\s*onHoverChange\?\.\(false\);\s*onActivate\(\);\s*\}/,
    );
    assert.match(overlapIndicatorSource, /if \(!open && event\.pointerType === "mouse"\) onHoverChange\?\.\(true\)/);
    assert.match(
      overlapIndicatorSource,
      /if \(!open && window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/,
    );
    assert.match(mapSource, /expandedOverlapBadgeId && !hoveredOverlapChooserImpact\s*\?\s*\[\]/);
    assert.doesNotMatch(
      mapSource,
      /className=\{`overlap-chooser-choice \$\{impact\.kind\}`\}[\s\S]*?onFocus=\{\(\) => onHoverImpact\(impact\)\}/,
    );
  });
});
