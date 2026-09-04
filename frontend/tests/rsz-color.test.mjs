import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const globalCss = readAppStylesheet();
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const rszPanelSource = readFileSync(new URL("../src/components/ReducedSpeedZonesPanel.tsx", import.meta.url), "utf8");
const directionalZoneCountSource = readFileSync(new URL("../src/components/DirectionalZoneCount.tsx", import.meta.url), "utf8");
const impactCardFieldsSource = readFileSync(new URL("../src/components/ImpactCardFields.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const legendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");
const stationDetailSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("Reduced Speed Zone amber color", () => {
  it("defines shared amber tokens and applies them to reduced-speed-zone selectors", () => {
    assert.match(globalCss, /--impact-rsz:\s*#F59E0B;/);
    assert.match(globalCss, /--impact-rsz-ink:\s*#78350f;/);
    assert.match(globalCss, /\.asset-alert-path-glow\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.rsz-chevron\s*\{[^}]*stroke:\s*var\(--impact-rsz-ink\)/s);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.impact-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-impact-ref\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz-border\)/s);
  });

  it("keeps delays golden yellow while RSZ references use amber classes or tokens", () => {
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#FEEC41/s);
    assert.match(mapSource, /RSZ_IMPACT_COLOR/);
    assert.match(rszPanelSource, /rsz-tone/);
    assert.match(shellSource, /rsz-tone/);
    assert.match(legendSource, /legend-rsz-button/);
    assert.match(stationDetailSource, /rsz-tone/);
    assert.doesNotMatch(rszPanelSource, /border-l-amber-500/);
    assert.doesNotMatch(rszPanelSource, /!bg-amber-50/);

    // Desktop bottom-left chip and menu badge use canonical amber tokens
    assert.match(globalCss, /\.desktop-header-impact-chips \.desktop-status-chip--reduced-speed-zone \.desktop-status-chip-count\s*\{[\s\S]*?color:\s*var\(--impact-rsz-ink\)/);
    assert.match(globalCss, /\.dark \.desktop-header-impact-chips \.desktop-status-chip--reduced-speed-zone \.desktop-status-chip-count\s*\{[\s\S]*?color:\s*var\(--impact-rsz\)/);
    assert.match(globalCss, /\.desktop-status-chip--reduced-speed-zone\s*\{[\s\S]*?color:\s*var\(--impact-rsz-ink\)/);
    assert.match(globalCss, /\.dark \.desktop-status-chip--reduced-speed-zone\s*\{[\s\S]*?color:\s*var\(--impact-rsz\)/);
    assert.match(globalCss, /\.desktop-menu-count-badge\.desktop-menu-count-rsz\s*\{[\s\S]*?color:\s*var\(--impact-rsz-ink\)/);
    assert.match(globalCss, /\.dark \.desktop-menu-count-badge\.desktop-menu-count-rsz\s*\{[\s\S]*?color:\s*var\(--impact-rsz\)/);
    assert.match(globalCss, /\.mobile-status-actions button\.mobile-status-btn-rsz \.mobile-status-btn-circle\[data-count="positive"\]\s*\{[\s\S]*?color:\s*var\(--impact-rsz-ink\)/);
    assert.match(globalCss, /\.dark \.mobile-status-actions button\.mobile-status-btn-rsz \.mobile-status-btn-circle\[data-count="positive"\]\s*\{[\s\S]*?color:\s*var\(--impact-rsz\)/);
  });

  it("stacks grouped directional zone counts as plain rows", () => {
    assert.match(
      directionalZoneCountSource,
      /className="rsz-zone-direction-breakdown"[\s\S]*?flexDirection:\s*"column"/,
    );
    assert.match(
      directionalZoneCountSource,
      /className="rsz-zone-direction-row"[\s\S]*?flexDirection:\s*"row"/,
    );
    assert.doesNotMatch(directionalZoneCountSource, /rsz-zone-direction-row[\s\S]{0,400}(?:border|background)/);
    assert.match(
      directionalZoneCountSource,
      /className="rsz-zone-direction-label"[\s\S]*?color:\s*"var\(--quiet\)"/,
    );
    assert.match(
      directionalZoneCountSource,
      /className="rsz-zone-direction-label"[\s\S]*?fontWeight:\s*400[\s\S]*?opacity:\s*0\.78[\s\S]*?marginInlineStart:\s*3/,
    );
    assert.match(directionalZoneCountSource, /className="rsz-zone-direction-label"[\s\S]*?\{label\}/);
    assert.doesNotMatch(directionalZoneCountSource, /\(to \{destination\}\)/);
    assert.match(rszPanelSource, /className="rsz-zone-count-label-separator"> - <\/span>/);
    assert.match(rszPanelSource, /className="rsz-zone-count-label-total">\{zonesAtLocation\}<\/span>/);
    assert.match(globalCss, /\.rsz-zone-count-label-separator\s*\{[^}]*color:\s*var\(--quiet\)/s);
    assert.match(globalCss, /\.dark \.rsz-zone-count-label-total,[\s\S]*?color:\s*#b8a66f/);
    assert.doesNotMatch(directionalZoneCountSource, /rsz-zone-count-total-badge/);
    assert.doesNotMatch(globalCss, /\.rsz-zone-count-total-badge/);
    assert.match(impactCardFieldsSource, /<dt>\{label\}\{labelSuffix\}<\/dt>/);
  });
});
