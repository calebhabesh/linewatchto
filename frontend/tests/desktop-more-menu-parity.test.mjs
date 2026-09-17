import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
});
