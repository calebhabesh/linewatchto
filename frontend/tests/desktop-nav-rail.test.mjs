import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopRailDestinationForView } from "../src/app/desktop-sidebar-state.ts";

import { readFileSync } from "node:fs";

const railSource = readFileSync(new URL("../src/components/DesktopNavRail.tsx", import.meta.url), "utf8");

describe("desktop navigation destinations", () => {
  const RAIL_DESTINATIONS = ["status", "stations", "commutes", "alert-history", "more", "alerts", "delays", "reduced-speed-zones", "closures", "trip-changes", "feedback", "analytics", "source-status"];

  it("defines the agreed desktop rail destinations in order", () => {
    assert.deepEqual(RAIL_DESTINATIONS, ["status", "stations", "commutes", "alert-history", "more", "alerts", "delays", "reduced-speed-zones", "closures", "trip-changes", "feedback", "analytics", "source-status"]);
  });

  it("maps views to top-level desktop destinations", () => {
    const destinationForView = desktopRailDestinationForView;

    assert.equal(destinationForView("status"), "status");
    assert.equal(destinationForView("alerts"), "alerts");
    assert.equal(destinationForView("delays"), "delays");
    assert.equal(destinationForView("reduced-speed-zones"), "reduced-speed-zones");
    assert.equal(destinationForView("closures"), "closures");
    assert.equal(destinationForView("trip-changes"), "trip-changes");
    assert.equal(destinationForView("search"), "status");
    assert.equal(destinationForView("commutes"), "commutes");
    assert.equal(destinationForView("my-stations"), "stations");
    assert.equal(destinationForView("saved"), "stations");
    assert.equal(destinationForView("alert-history"), "alert-history");
    assert.equal(destinationForView("source-status"), "source-status");
    assert.equal(destinationForView("analytics"), "analytics");
    assert.equal(destinationForView("accessibility-outages"), "accessibility-outages");
    assert.equal(destinationForView("surface-notices"), "surface-notices");
    assert.equal(destinationForView("announcements"), "announcements");
    assert.equal(destinationForView("feedback"), "feedback");
    assert.equal(destinationForView("map"), "status");
  });

  it("includes Sign In entry under Status with mobile account icon styling", () => {
    assert.match(railSource, /{\s*key:\s*"status",\s*label:\s*"Status"/);
    assert.match(railSource, /{\s*key:\s*"sign-in",\s*label:\s*"Sign In",\s*Icon:\s*UserRound\s*}/);
    assert.match(railSource, /className="desktop-rail-item desktop-rail-account-item"/);
    assert.match(railSource, /data-authenticated=\{authenticated \? "true" : "false"\}/);
    assert.match(railSource, /data-dest="sign-in"/);
    assert.match(railSource, /authenticated \? "Account" : label/);
    assert.match(railSource, /<span className="desktop-rail-label">\{label\}<\/span>/);
  });

  it("renders notice shortcuts group above alert shortcuts with dividers", () => {
    assert.match(railSource, /className="desktop-rail-notice-shortcuts"/);
    assert.match(railSource, /key:\s*"accessibility-outages"/);
    assert.match(railSource, /key:\s*"surface-notices"/);
    assert.match(railSource, /key:\s*"announcements"/);
    assert.match(railSource, /className="desktop-rail-notice-shortcuts"[\s\S]*?className="desktop-rail-alert-shortcuts"/);
  });

  it("renders a bottom divider line with Feedback, Data, and Source Status menus below it", () => {
    assert.match(railSource, /className="desktop-rail-divider"/);
    assert.match(railSource, /data-dest="feedback"/);
    assert.match(railSource, />\s*Feedback\s*<\/span>/);
    assert.match(railSource, /MessageSquareText/);
    assert.match(railSource, /data-dest="analytics"/);
    assert.match(railSource, />\s*Data\s*<\/span>/);
    assert.match(railSource, /BarChart3/);
    assert.match(railSource, /data-dest="source-status"/);
    assert.match(railSource, /<span>Source<\/span>\s*<span>Status<\/span>/);
    assert.match(railSource, /data-dest="feedback"[\s\S]*?data-dest="analytics"[\s\S]*?data-dest="source-status"/);
  });

  it("places network-specific alert shortcuts immediately above the bottom divider", () => {
    assert.match(railSource, /selectedNetwork === "regional"[\s\S]*?key: "trip-changes"[\s\S]*?key: "closures"/);
    assert.match(railSource, /key: "reduced-speed-zones"[\s\S]*?key: "closures"/);
    assert.match(railSource, /className="desktop-rail-alert-shortcuts"[\s\S]*?className="desktop-rail-divider"/);
    assert.match(railSource, /lines: \["Suspensions"\]/);
    assert.match(railSource, /lines: \["Reduced", "Speed", "Zones"\]/);
    assert.match(railSource, /shortcut\.count > 0/);
  });

  it("places NetworkSelector inside desktop center map control console in TTC and regional maps", () => {
    const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
    const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
    const mapControlsCss = readFileSync(new URL("../src/styles/shell/map-controls.css", import.meta.url), "utf8");

    assert.match(ttcMapSource, /className="desktop-map-control-network-group hidden md:flex items-center"/);
    assert.match(ttcMapSource, /<NetworkSelector network="ttc" onChange=\{onNetworkChange\} ariaLabel="Map network switcher" \/>/);

    assert.match(regionalMapSource, /className="desktop-map-control-network-group hidden md:flex items-center"/);
    assert.match(regionalMapSource, /<NetworkSelector network="regional" onChange=\{onNetworkChange\} ariaLabel="Map network switcher" \/>/);

    assert.match(mapControlsCss, /\.desktop-map-control-network-group\s*\{[^}]*gap:\s*21px;/s);
    assert.match(mapControlsCss, /\.map-control-rail\s+\.network-selector\s*\{[^}]*margin:\s*0 7px 0 0;/s);
  });

  it("renders stretched NetworkSelector on the status page above Current Service header", () => {
    const statusOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
    const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
    const desktopChromeCss = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");

    assert.match(statusOverviewSource, /<NetworkSelector[\s\S]*?network=\{networkId\}[\s\S]*?onChange=\{onNetworkChange\}[\s\S]*?stretched/);
    assert.match(shellSource, /<DesktopStatusOverview[\s\S]*?onNetworkChange=\{handleNetworkChange\}/);

    const switcherIndex = statusOverviewSource.indexOf('className="desktop-status-network-switcher"');
    const headerRowIndex = statusOverviewSource.indexOf('className="desktop-status-header-row"');
    assert.ok(switcherIndex > -1, "desktop-status-network-switcher must exist");
    assert.ok(headerRowIndex > -1, "desktop-status-header-row must exist");
    assert.ok(switcherIndex < headerRowIndex, "network switcher must precede Current Service header row");

    assert.match(desktopChromeCss, /\.network-selector--stretched\s*\{[^}]*width:\s*100%;/s);
    assert.match(desktopChromeCss, /\.network-selector--stretched\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\);/s);
  });

  it("places alert categories grid above secondary information collections in status overview", () => {
    const statusOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
    const infoRowIndex = statusOverviewSource.indexOf('className="desktop-status-info-row"');
    const categoriesGridIndex = statusOverviewSource.indexOf('className="desktop-status-categories-grid"');

    assert.ok(infoRowIndex > -1, "desktop-status-info-row must exist");
    assert.ok(categoriesGridIndex > -1, "desktop-status-categories-grid must exist");
    assert.ok(categoriesGridIndex < infoRowIndex, "desktop-status-categories-grid must precede desktop-status-info-row");
  });

  it("styles rail items with blue hover preview pill and active selection bar highlight", () => {
    const desktopChromeCss = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");
    assert.match(desktopChromeCss, /\.desktop-rail-item::before\s*\{[^}]*width:\s*3\.5px/s);
    assert.match(desktopChromeCss, /\.desktop-rail-item:hover:not\(\[data-active="true"\]\)::before\s*\{[^}]*scaleY\(0\.38\)/s);
    assert.match(desktopChromeCss, /\.desktop-rail-item\[data-active="true"\]::before\s*\{[^}]*scaleY\(1\)/s);
    assert.match(desktopChromeCss, /\.desktop-rail-item\[data-active="true"\]::after\s*\{[^}]*opacity:\s*1/s);
    assert.match(desktopChromeCss, /\.desktop-rail-items\s*\{[^}]*overflow-y:\s*auto;/s);
    assert.match(desktopChromeCss, /\.desktop-rail-alert-shortcut\[data-alert-kind="closures"\] \.desktop-rail-alert-badge\s*\{[^}]*background:\s*#2563eb;/s);
  });

  it("mutes alert and notice shortcut icons when active incidents count is zero", () => {
    const desktopChromeCss = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");
    assert.match(railSource, /className="desktop-rail-item desktop-rail-alert-shortcut"[\s\S]*?data-count=\{shortcut\.count\}/);
    assert.match(railSource, /className="desktop-rail-item desktop-rail-notice-shortcut"[\s\S]*?data-count=\{shortcut\.count\}/);
    assert.match(desktopChromeCss, /\.desktop-rail-alert-shortcut\[data-alert-kind="alerts"\]:not\(\[data-count="0"\]\) \.desktop-rail-icon-slot/);
    assert.match(desktopChromeCss, /\.desktop-rail-alert-shortcut\[data-alert-kind="delays"\]:not\(\[data-count="0"\]\) \.desktop-rail-icon-slot/);
  });

  it("styles desktop-status-info-badge with slate/visionOS styling and submenu colors", () => {
    const desktopChromeCss = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");
    assert.match(desktopChromeCss, /\.desktop-status-info-badge\s*\{[^}]*background:\s*rgba\(100,\s*116,\s*139,\s*0\.14\);/s);
    assert.match(desktopChromeCss, /\.desktop-status-info-badge\s*\{[^}]*box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.85\);/s);
    assert.match(desktopChromeCss, /\.desktop-status-info-badge\s*\{[^}]*color:\s*#334155;/s);
    assert.match(desktopChromeCss, /\.dark \.desktop-status-info-badge\s*\{[^}]*background:\s*rgba\(148,\s*163,\s*184,\s*0\.20\);/s);
    assert.match(desktopChromeCss, /\.dark \.desktop-status-info-badge\s*\{[^}]*box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.15\);/s);
    assert.match(desktopChromeCss, /\.dark \.desktop-status-info-badge\s*\{[^}]*color:\s*#cbd5e1;/s);

    // Accessibility (purple)
    assert.match(desktopChromeCss, /\.desktop-status-info-badge--accessibility\[data-count="positive"\]\s*\{[^}]*color:\s*#7e22ce;/s);
    assert.match(desktopChromeCss, /\.dark \.desktop-status-info-badge--accessibility\[data-count="positive"\]\s*\{[^}]*color:\s*#e9d5ff;/s);

    // Surface Notices (green)
    assert.match(desktopChromeCss, /\.desktop-status-info-badge--surface\[data-count="positive"\]\s*\{[^}]*color:\s*#047857;/s);
    assert.match(desktopChromeCss, /\.dark \.desktop-status-info-badge--surface\[data-count="positive"\]\s*\{[^}]*color:\s*#a7f3d0;/s);
  });

  describe("keyboard roving focus navigation", () => {
    it("supports ArrowDown, ArrowUp, Home, and End roving focus across rail items", () => {
      assert.match(railSource, /handleItemKeyDown/);
      assert.match(railSource, /event\.key === "ArrowDown"/);
      assert.match(railSource, /event\.key === "ArrowUp"/);
      assert.match(railSource, /event\.key === "Home"/);
      assert.match(railSource, /event\.key === "End"/);
      assert.match(railSource, /handleToggleKeyDown/);
      assert.match(railSource, /itemRefs\.current\[0\]\?\.focus\(\)/);
    });

    it("binds refs and keyboard handlers to all rail buttons", () => {
      assert.match(railSource, /itemRefs\.current\[index\] = element/);
      assert.match(railSource, /onKeyDown=\{\(e\) => handleItemKeyDown\(index, e\)\}/);
      assert.match(railSource, /onKeyDown=\{handleToggleKeyDown\}/);
    });
  });
});
