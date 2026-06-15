import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/AccessibilityOutagesPanel.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

describe("accessibility outages panel and routing source verification", () => {
  it("verifies LineWatchShell.tsx includes accessibility-outages view and mobile status routing", () => {
    assert.match(shellSource, /"accessibility-outages"/);
    assert.match(shellSource, /<AccessibilityOutagesPanel/);
    assert.match(shellSource, /accessibilityOutageResult/);
    assert.match(shellSource, /setActiveView\(isMobile \? "status" : "menu"\)/);
    assert.match(shellSource, /activeView === "accessibility-outages" \?/);
  });

  it("verifies AccessibilityOutagesPanel uses the three existing SVG assets", () => {
    assert.match(panelSource, /\/assets\/linewatch\/accessibility-alert\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/outages\/escalator\.svg/);
  });

  it("verifies station rows expose aria-expanded", () => {
    assert.match(panelSource, /aria-expanded=\{expanded\}/);
    assert.match(panelSource, /aria-controls=\{`outages-list-\${expandedKey}`\}/);
  });

  it("keeps the View Station action aligned with default button typography", () => {
    const viewStationButton = panelSource.match(
      /<button\s+[^>]*onClick=\{\(\) => onSelectStation\(station\.stationId\)\}[\s\S]*?className="(?<className>[^"]+)"[\s\S]*?>[\s\S]*?View Station[\s\S]*?<\/button>/,
    );

    assert.ok(viewStationButton?.groups?.className);
    assert.match(panelSource, /<span className="text-sm font-bold leading-none">\s*View Station\s*<\/span>/);
    assert.doesNotMatch(viewStationButton.groups.className, /text-xs/);
    assert.doesNotMatch(viewStationButton.groups.className, /text-\[10px\]/);
    assert.doesNotMatch(viewStationButton.groups.className, /font-bold/);
    assert.doesNotMatch(viewStationButton.groups.className, /font-black/);
    assert.doesNotMatch(viewStationButton.groups.className, /tracking-/);
    assert.doesNotMatch(panelSource, /fontFamily: "var\(--font-sans\)"/);
  });

  it("verifies Accessibility Outages appears in MobileStatusSheet, not MobileMoreSheet", () => {
    assert.match(statusSheetSource, /"accessibility-outages"/);
    assert.match(statusSheetSource, /mobile-status-btn-accessibility/);
    assert.doesNotMatch(moreSheetSource, /"accessibility-outages"/);
    assert.doesNotMatch(moreSheetSource, /mobile-status-btn-accessibility/);
  });
});
