import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop sidebar refinement - Checkpoint F: Stacked Header Clock", () => {
  it("renders stacked time and date right-aligned on the same line as icon/wordmark", () => {
    // Shell places desktop-sidebar-clock inside desktop-sidebar-header-top
    assert.match(
      shellSource,
      /<div className="desktop-sidebar-header-top">[\s\S]*?className="desktop-sidebar-clock"[\s\S]*?desktop-sidebar-clock-time[\s\S]*?desktop-sidebar-clock-date/
    );

    // Bottom alignment: icon, wordmark, and clock stack align on the bottom edge
    assert.match(shellSource, /className="flex items-end gap-2\.5 select-none"/);
    assert.match(globalCss, /\.desktop-sidebar-header-top\s*\{[^}]*align-items:\s*flex-end/);
    assert.match(globalCss, /\.desktop-sidebar-clock\s*\{[^}]*align-items:\s*flex-end/);
    assert.match(globalCss, /\.desktop-sidebar-clock\s*\{[^}]*justify-content:\s*flex-end/);
    assert.match(globalCss, /\.desktop-sidebar-clock-time\s*\{[^}]*font-size:\s*15px/);
    assert.match(globalCss, /\.desktop-sidebar-clock-date\s*\{[^}]*font-size:\s*12px/);
  });
});
