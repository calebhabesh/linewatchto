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
  it("reuses canonical badges for transit lines and accessibility destinations", () => {
    assert.match(searchPanelSource, /<TransitLineBadge[\s\S]*lineId=\{result\.line\.id\}[\s\S]*size=\{28\}[\s\S]*decorative/);
    assert.match(searchPanelSource, /<TransitLineBadge[\s\S]*lineId=\{group\.line\.id\}[\s\S]*size=\{30\}[\s\S]*decorative/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/accessibility-alert\.svg"/);
    assert.doesNotMatch(searchPanelSource, /PanelsTopLeft|TrainFront/);
    assert.match(globalCss, /\.global-search-resource-icon--standard\s*\{[^}]*background:\s*transparent;/s);
  });

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
    assert.match(searchPanelSource, /searchStationsAcrossNetworks\(stationCatalogs,\s*currentNetwork,\s*query/);
    assert.doesNotMatch(searchPanelSource, /station-search-network-badge/);
    assert.match(searchPanelSource, /global-search-network-heading \$\{networkId\}/);
    assert.match(searchPanelSource, /station-search-network-heading \$\{group\.networkId\}/);
    assert.match(searchPanelSource, /result\.networkId === currentNetwork/);
    assert.match(shellSource, /stationCatalogs=\{stationCatalogs\}/);
    assert.match(shellSource, /crossNetworkStationSelectionRef/);
    assert.match(
      globalCss,
      /\.station-search-network-heading::before,[\s\S]*?\.global-search-network-heading::before\s*\{[^}]*position:\s*absolute;[^}]*left:\s*0;[^}]*width:\s*1px;[^}]*background:\s*#ff5a5f;[^}]*box-shadow:/s,
    );
    assert.match(
      globalCss,
      /\.station-search-network-heading\.regional::before,[\s\S]*?\.global-search-network-heading\.regional::before\s*\{[^}]*background:\s*#31f0aa;[^}]*box-shadow:/s,
    );
    assert.match(
      globalCss,
      /\.station-search-stations-column-header\s*\{[^}]*margin-top:\s*10px;[^}]*margin-bottom:\s*10px;/s,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.station-search-stations-column-header\s*\{[^}]*margin-top:\s*0\s*!important;[^}]*margin-bottom:\s*12px\s*!important;/s,
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
      /\.station-search-amenity-toolbar\s*\{[^}]*margin-left:\s*-10px;[^}]*padding:\s*2px 10px 12px 10px;[^}]*border-bottom:\s*1px solid/s,
    );
  });

  it("renders all applicable amenity filter chips and balances mobile back button spacing", () => {
    assert.match(searchPanelSource, /toggleAmenityFilter\("wheelchair"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("elevator"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("washroom"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("parking"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("bicycleLockup"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("bicycleRepair"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("bikeShare"\)/);
    assert.match(searchPanelSource, /toggleAmenityFilter\("ppudo"\)/);

    assert.match(searchPanelSource, /src="\/assets\/linewatch\/accessible\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/outages\/elevator\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/washroom\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/parking\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/bicycle-lockup\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/bicycle-repair\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/bike-share-toronto\.svg"/);
    assert.match(searchPanelSource, /src="\/assets\/linewatch\/passenger-pick-up\.svg"/);

    assert.match(
      globalCss,
      /\.station-search-mobile-back\s*\{[^}]*margin-top:\s*12px\s*!important;[^}]*margin-bottom:\s*12px\s*!important;/s,
    );
  });

  it("places connecting transit line badges beside station text and positions alert/outage flags on the right", () => {
    assert.match(
      searchPanelSource,
      /<span className="station-search-station-header[^"]*">\s*<span className="station-search-station-name">\{station\.name\}<\/span>\s*\{displayLines\.length > 0 && \(\s*<span className="station-search-line-badges/,
    );
    assert.match(
      searchPanelSource,
      /<span className="station-search-end[^"]*" aria-hidden="true">\s*<StationMetaFlags station=\{station\} impactKinds=\{impactKinds\} \/>\s*<\/span>/,
    );
    assert.match(
      globalCss,
      /\.station-search-station-header\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*6px;/s,
    );
    assert.match(
      globalCss,
      /\.station-search-end\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;[^}]*justify-content:\s*flex-end;/s,
    );
  });

  it("applies borderless tactile container styling across all search and mini-search containers", () => {
    // Station search elements are borderless with tactile specular highlights
    assert.match(globalCss, /\.station-search-station\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.station-search-station\s*\{[\s\S]*?box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.85\)/);
    assert.match(globalCss, /\.dark \.station-search-station\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.station-search-station\s*\{[\s\S]*?background:\s*#161a23\s*!important;/);

    assert.match(globalCss, /\.station-search-bookmark\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.station-search-bookmark\s*\{[\s\S]*?border:\s*none\s*!important;/);

    assert.match(globalCss, /\.station-search-amenity-chip\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.station-search-amenity-chip\s*\{[\s\S]*?border:\s*none\s*!important;/);

    assert.match(globalCss, /\.station-search-line-trigger\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.station-search-line-trigger\s*\{[\s\S]*?border:\s*none\s*!important;/);

    assert.match(globalCss, /\.station-search-input\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.station-search-input\s*\{[\s\S]*?border:\s*none\s*!important;/);

    assert.match(globalCss, /\.global-search-category-shortcuts button,\s*\.global-search-browse-alerts button\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.global-search-impact-result\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.global-search-impact-result\s*\{[\s\S]*?border-left:\s*2px solid var\(--impact-accent/);

    // Header container is completely opaque
    assert.match(globalCss, /\.station-search-stations-column-header\s*\{[\s\S]*?opacity:\s*1\s*!important;/);
    assert.match(globalCss, /\.dark \.global-search-network-heading,\s*\.dark \.station-search-stations-column-header\s*\{[\s\S]*?background:\s*#26171a\s*!important;/);
    assert.match(globalCss, /\.dark \.global-search-network-heading,\s*\.dark \.station-search-stations-column-header\s*\{[\s\S]*?opacity:\s*1\s*!important;/);

    // Mini-search commute station picker
    assert.match(globalCss, /\.commute-station-trigger,\s*\.commute-station-search-row,\s*\.commute-station-popover\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.commute-station-line-trigger,\s*\.commute-station-option\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.commute-station-trigger,\s*\.dark \.commute-station-popover/);
  });
});
