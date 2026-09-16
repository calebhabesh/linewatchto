import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop sidebar refinement - Checkpoint G: Slate / VisionOS Search Bar", () => {
  it("uses the placeholder 'Search Stations and Alerts...' in the desktop sidebar search bar", () => {
    assert.match(
      shellSource,
      /className="desktop-sidebar-search-input"[\s\S]*?placeholder="Search Stations and Alerts\.\.\."/
    );
  });

  it("applies the exact original borderless elevated dark panel styling with 12px radius and specular shadow", () => {
    assert.match(globalCss, /\.desktop-sidebar-search-input\s*\{[^}]*border-radius:\s*12px/);
    assert.match(globalCss, /\.desktop-sidebar-search-input\s*\{[^}]*border:\s*none/);
    assert.match(globalCss, /\.dark \.desktop-sidebar-search-input\s*\{[^}]*background:\s*#12151c/);
    assert.match(globalCss, /\.dark \.desktop-sidebar-search-input\s*\{[^}]*border:\s*none/);
    assert.match(globalCss, /\.dark \.desktop-sidebar-search-input:hover\s*\{[^}]*background:\s*#1a1e28/);
    assert.match(globalCss, /\.desktop-sidebar-search-field\s*\{[^}]*font-weight:\s*600/);
    assert.match(globalCss, /\.desktop-sidebar-search-field::placeholder\s*\{[^}]*color:\s*#94a3b8/);
  });
});
