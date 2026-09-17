import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopRailDestinationForView } from "../src/app/desktop-sidebar-state.ts";

import { readFileSync } from "node:fs";

const railSource = readFileSync(new URL("../src/components/DesktopNavRail.tsx", import.meta.url), "utf8");

describe("desktop navigation destinations", () => {
  const RAIL_DESTINATIONS = ["status", "stations", "commutes", "alert-history", "more", "alerts", "delays", "reduced-speed-zones", "closures", "trip-changes", "analytics", "source-status"];

  it("defines the agreed desktop rail destinations in order", () => {
    assert.deepEqual(RAIL_DESTINATIONS, ["status", "stations", "commutes", "alert-history", "more", "alerts", "delays", "reduced-speed-zones", "closures", "trip-changes", "analytics", "source-status"]);
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
    assert.equal(destinationForView("feedback"), "more");
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

  it("renders a bottom divider line with Source Status and Data menus below it", () => {
    assert.match(railSource, /className="desktop-rail-divider"/);
    assert.match(railSource, /data-dest="source-status"/);
    assert.match(railSource, /<span>Source<\/span>\s*<span>Status<\/span>/);
    assert.match(railSource, /data-dest="analytics"/);
    assert.match(railSource, />\s*Data\s*<\/span>/);
    assert.match(railSource, /BarChart3/);
  });

  it("places network-specific alert shortcuts immediately above the bottom divider", () => {
    assert.match(railSource, /selectedNetwork === "regional"[\s\S]*?key: "trip-changes"[\s\S]*?key: "closures"/);
    assert.match(railSource, /key: "reduced-speed-zones"[\s\S]*?key: "closures"/);
    assert.match(railSource, /className="desktop-rail-alert-shortcuts"[\s\S]*?className="desktop-rail-divider"/);
    assert.match(railSource, /lines: \["Active", "Alerts"\]/);
    assert.match(railSource, /lines: \["Reduced", "Speed", "Zones"\]/);
    assert.match(railSource, /shortcut\.count > 0/);
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
});
