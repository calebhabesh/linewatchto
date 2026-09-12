import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const panel = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const stationsPanel = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const styles = readAppStylesheet();

describe("My Commutes Control Console UI", () => {
  it("mirrors the My Stations 3-row control console design with commute-specific analogues", () => {
    // Top row: search + add action button
    assert.match(panel, /my-stations-controls saved-commute-controls/);
    assert.match(panel, /my-stations-controls-top/);
    assert.match(panel, /Search saved commutes\.\.\./);
    assert.match(panel, /<Search size=\{15\}/);
    assert.match(panel, /<Plus size=\{16\}/);
    assert.match(panel, /my-commutes-add/);
    assert.match(panel, /Add Commute/);
    assert.match(panel, /<span className="my-stations-add-wide">Add Commute<\/span>/);
    assert.match(panel, /<span className="my-stations-add-compact">Add<\/span>/);

    // Middle row: network filter
    assert.match(panel, /account-network-filter/);
    assert.match(panel, /aria-label="Filter My Commutes by network"/);

    // Bottom row: sort dropdown left aligned and badges right aligned on the same line
    assert.match(panel, /my-stations-selects saved-commute-selects/);
    assert.match(panel, /prefix="Sort"/);
    assert.match(panel, /align="left"/);
    assert.match(panel, /data-testid="commute-status-badges"/);
    assert.match(panel, /ml-auto shrink-0/);

    // Line sort removed
    assert.doesNotMatch(panel, /prefix="Line"/);
    assert.doesNotMatch(panel, /Filter commutes by line/i);

    // "Your Routes" line removed
    assert.doesNotMatch(panel, /Your Routes/);

    // Header green/amber jewel badges preserved
    assert.match(panel, /data-testid="header-commute-status-badges"/);
    assert.match(panel, /desktop-menu-count-commutes-clear/);
    assert.match(panel, /desktop-menu-count-commutes-affected/);
  });

  it("renders slate/visionos toolbar status badges for Total, Affected, and Clear", () => {
    // SavedCommutesPanel
    assert.match(panel, /toolbar-status-badge toolbar-status-badge--total/);
    assert.match(panel, /toolbar-status-badge toolbar-status-badge--clear/);
    assert.match(panel, /toolbar-status-badge toolbar-status-badge--affected/);
    assert.match(panel, /\{visibleCommutes\.length\} Total/);
    assert.match(panel, /\{commuteClearCount\} Clear/);
    assert.match(panel, /\{commuteAffectedCount\} Affected/);
    assert.ok(
      panel.indexOf('toolbar-status-badge--clear') < panel.indexOf('toolbar-status-badge--affected'),
      'Clear badge must appear before Affected badge in SavedCommutesPanel'
    );

    // MyStationsPanel
    assert.match(stationsPanel, /toolbar-status-badge toolbar-status-badge--total/);
    assert.match(stationsPanel, /toolbar-status-badge toolbar-status-badge--clear/);
    assert.match(stationsPanel, /toolbar-status-badge toolbar-status-badge--affected/);
    assert.match(stationsPanel, /\{visible\.length\} Total/);
    assert.match(stationsPanel, /\{visibleSavedStationsClearCount\} Clear/);
    assert.match(stationsPanel, /\{visibleSavedStationsAffectedCount\} Affected/);
    assert.ok(
      stationsPanel.indexOf('toolbar-status-badge--clear') < stationsPanel.indexOf('toolbar-status-badge--affected'),
      'Clear badge must appear before Affected badge in MyStationsPanel'
    );

    // Stylesheet rules
    assert.match(styles, /\.toolbar-status-badge\s*\{[^}]*box-shadow:\s*inset\s+0\s+1px\s+0\s+rgba\(255,\s*255,\s*255,\s*0\.85\);/s);
    assert.match(styles, /\.toolbar-status-badge\s*\{[^}]*border-radius:\s*9999px;/s);
    assert.match(styles, /\.toolbar-status-badge--total\s*\{[^}]*background:\s*rgba\(100,\s*116,\s*139,\s*0\.14\);/s);
    assert.match(styles, /\.toolbar-status-badge--affected\s*\{[^}]*background:\s*rgba\(245,\s*158,\s*11,\s*0\.18\);/s);
    assert.match(styles, /\.toolbar-status-badge--clear\s*\{[^}]*background:\s*rgba\(16,\s*185,\s*129,\s*0\.14\);/s);
    assert.match(styles, /\.dark \.toolbar-status-badge\s*\{[^}]*box-shadow:\s*inset\s+0\s+1px\s+0\s+rgba\(255,\s*255,\s*255,\s*0\.15\);/s);
    assert.match(styles, /\.high-contrast \.toolbar-status-badge/);
    assert.match(styles, /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.toolbar-status-badge\s*\{[^}]*height:\s*25px;/s);
  });

  it("applies green accent and flex layout styles to commute controls", () => {
    assert.match(styles, /\.my-commutes-add\s*\{[^}]*background:\s*rgb\(5,\s*150,\s*105\);/s);
    assert.match(styles, /\.my-commutes-add\s*\{[^}]*width:\s*128px;/s);
    assert.match(styles, /\.saved-commute-selects\s*\{(?=[^}]*justify-content:\s*space-between;)(?=[^}]*display:\s*flex;)[^}]*\}/s);
  });

  it("equalizes 10px spacing from header to controls and from controls to cards", () => {
    assert.match(styles, /\.commute-panel \.panel-header\s*\{[^}]*padding-bottom:\s*10px;/s);
    assert.match(styles, /\.saved-commute-controls\s*\{[^}]*padding-bottom:\s*10px;/s);
    assert.doesNotMatch(styles, /\.saved-commute-controls\s*\{[^}]*margin-bottom:\s*-\d+px;/s);
    assert.match(styles, /\.commute-grid\s*\{[^}]*padding:\s*0\b/s);
    assert.match(styles, /\.saved-commute-controls \+ \.commute-grid/s);
    assert.match(panel, /className="commute-grid min-w-0 pb-3 flex flex-col gap-3"/);
  });
});
