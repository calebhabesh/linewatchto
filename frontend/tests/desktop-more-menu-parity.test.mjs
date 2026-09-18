import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const desktopMoreSource = readFileSync(new URL("../src/components/DesktopMorePanel.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

describe("desktop More menu parity", () => {
  it("keeps the support and guide destinations carried by the old and mobile menus", () => {
    assert.match(mobileMoreSource, /href=\{supportUrl\}/);
    assert.match(mobileMoreSource, /href="\/explore"/);
    assert.match(desktopMoreSource, /supportUrl: string/);
    assert.match(desktopMoreSource, /href=\{supportUrl\}/);
    assert.match(desktopMoreSource, />\s*Support\s*</);
    assert.match(desktopMoreSource, /href="\/explore"/);
    assert.match(desktopMoreSource, />\s*Transit Guides\s*</);
    assert.match(shellSource, /<DesktopMorePanel[\s\S]*?supportUrl=\{supportUrl\}/);
  });

  it("renders the default map mode switcher directly without a nested container card, matching container footprint", () => {
    assert.doesNotMatch(
      desktopMoreSource,
      /desktop-more-section--default-map[\s\S]*?className="desktop-more-card"/,
    );
    assert.match(
      desktopMoreSource,
      /desktop-more-section--default-map[\s\S]*?className="default-map-mode-options desktop-more-default-map-options"/,
    );

    const globalCss = readAppStylesheet();
    assert.match(globalCss, /\.desktop-more-section--default-map \.desktop-more-default-map-options\s*\{[^}]*width:\s*100%;/s);
    assert.match(globalCss, /\.desktop-more-section--default-map \.desktop-more-default-map-options\s*\{[^}]*height:\s*44px;/s);
    assert.match(globalCss, /\.desktop-more-section--default-map \.desktop-more-default-map-options\s*\{[^}]*border-radius:\s*8px;/s);
  });
});
