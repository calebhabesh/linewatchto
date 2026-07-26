import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const searchPanelSource = readFileSync(
  new URL("../src/components/StationSearchPanel.tsx", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/components/LineWatchShell.tsx", import.meta.url),
  "utf8",
);

describe("unified search alert group headings", () => {
  it("uses a muted alert-type icon beside each alert group label", () => {
    assert.match(
      searchPanelSource,
      /global-search-\$\{group\.kind\}-heading[^]*?<ImpactTypeIcon kind=\{group\.kind\} size=\{14\} \/>[^]*?\{group\.label\}/,
    );
    assert.match(
      globalCss,
      /\.global-search-group-heading h3 svg\s*\{[^}]*color:\s*rgb\(100,\s*116,\s*139\);[^}]*opacity:\s*0\.72;/s,
    );
  });

  it("keeps both network catalogs searchable and groups network-safe station results", () => {
    assert.match(searchPanelSource, /searchStationsAcrossNetworks\(stationCatalogs,\s*currentNetwork,\s*query\)/);
    assert.doesNotMatch(searchPanelSource, /station-search-network-badge/);
    assert.match(searchPanelSource, /global-search-network-heading \$\{networkId\}/);
    assert.match(searchPanelSource, /station-search-network-heading \$\{group\.networkId\}/);
    assert.match(searchPanelSource, /result\.networkId === currentNetwork/);
    assert.match(shellSource, /stationCatalogs=\{stationCatalogs\}/);
    assert.match(shellSource, /crossNetworkStationSelectionRef/);
    assert.match(
      globalCss,
      /\.station-search-network-heading::before,[\s\S]*?\.global-search-network-heading::before\s*\{[^}]*background:\s*repeating-linear-gradient\([^)]*#ef4444 0 1px,[^)]*transparent 1px 3px[^)]*\);/s,
    );
    assert.match(
      globalCss,
      /\.station-search-network-heading\.regional::before,[\s\S]*?\.global-search-network-heading\.regional::before\s*\{[^}]*background:\s*repeating-linear-gradient\([^)]*#10b981 0 1px,[^)]*transparent 1px 3px[^)]*\);/s,
    );
    assert.match(
      globalCss,
      /\.station-search-stations-column-header\s*\{[^}]*margin-bottom:\s*10px;/s,
    );
    assert.match(
      globalCss,
      /\.station-search-stations-column-heading-content\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/s,
    );
    assert.match(
      globalCss,
      /\.station-search-network-heading\s*\{[^}]*justify-content:\s*flex-start;[^}]*margin-bottom:\s*8px;/s,
    );
    assert.match(
      globalCss,
      /\.station-search-network-heading span\s*\{[^}]*margin-left:\s*auto;/s,
    );
  });
});
