import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const guideComponentUrl = new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url);
const guideAssetUrl = new URL("../public/assets/linewatch/site-guide.svg", import.meta.url);
const logoAssetUrl = new URL("../public/assets/linewatch/transportation-train.svg", import.meta.url);
const guideIconAssetNames = [
  "share-iphone.svg",
  "add-to-homescreen-android.svg",
];
const infoOverlayAssetNames = [
  "1-way-active-alert.svg",
  "2-way-active.svg",
  "1-way-delay.svg",
  "2-way-delay.svg",
  "1-way-rsz.svg",
  "2-way-rsz.svg",
  "info-upcoming-closure.svg",
  "station-ring.svg",
  "info-overlapping-marker.svg",
];

describe("site guide dropdown", () => {
  it("ships the guide icon and logo as public LineWatch assets", () => {
    assert.equal(existsSync(guideAssetUrl), true);
    assert.equal(existsSync(logoAssetUrl), true);
    assert.match(readFileSync(guideAssetUrl, "utf8"), /<svg\b/);
    assert.match(readFileSync(logoAssetUrl, "utf8"), /<svg\b/);
  });

  it("ships authored map overlay guide assets", () => {
    for (const assetName of infoOverlayAssetNames) {
      const assetUrl = new URL(`../public/assets/linewatch/info-map-overlays/${assetName}`, import.meta.url);
      assert.equal(existsSync(assetUrl), true, `${assetName} should be copied into public guide assets`);
      assert.match(readFileSync(assetUrl, "utf8"), /<svg\b/);
    }
  });

  it("ships authored install guide icons", () => {
    for (const assetName of guideIconAssetNames) {
      const assetUrl = new URL(`../public/assets/linewatch/guide-icons/${assetName}`, import.meta.url);
      assert.equal(existsSync(assetUrl), true, `${assetName} should be copied into public guide assets`);
      const assetSource = readFileSync(assetUrl, "utf8");

      assert.match(assetSource, /<svg\b/);
      assert.match(assetSource, /stroke="#ffffff"/);
      assert.match(assetSource, /fill="none"/);
      assert.doesNotMatch(assetSource, /fill:#000000/);
      assert.doesNotMatch(assetSource, /stroke="#000000"/);
    }
  });

  it("keeps the station impact ring preview compact with the original circle structure", () => {
    const stationRingAsset = readFileSync(
      new URL("../public/assets/linewatch/info-map-overlays/station-ring.svg", import.meta.url),
      "utf8",
    );

    assert.match(stationRingAsset, /viewBox="0 0 88 30"/);
    assert.match(stationRingAsset, /id="path1"[\s\S]*inkscape:label="inner-circle"/);
    assert.match(stationRingAsset, /id="path2"[\s\S]*inkscape:label="golden-outer-ring"/);
    assert.match(stationRingAsset, /id="path1"[\s\S]*fill:#ef4444/);
    assert.match(stationRingAsset, /id="path1"[\s\S]*stroke:#000000/);
    assert.match(stationRingAsset, /id="path2"[\s\S]*stroke:#facc15/);
    assert.doesNotMatch(stationRingAsset, /station-ring-gold-halo/);
    assert.doesNotMatch(stationRingAsset, /station-ring-red-glow/);
    assert.doesNotMatch(stationRingAsset, /station-ring-static-pulse/);
    assert.doesNotMatch(stationRingAsset, /<animate\b/);
  });

  it("renders after the ingestion log and theme buttons in the top-right map rail", () => {
    assert.match(interactiveMapSource, /import \{ SiteGuideDropdown \} from "\.\/SiteGuideDropdown";/);
    assert.match(interactiveMapSource, /<LogsDropdown \/>[\s\S]*aria-label="Toggle theme"[\s\S]*<SiteGuideDropdown \/>/);
  });

  it("explains the dashboard, controls, overlay meanings, and title capitalization", () => {
    const guideSource = readFileSync(guideComponentUrl, "utf8");
    assert.match(guideSource, /export function SiteGuideDropdown/);
    assert.match(guideSource, /\/assets\/linewatch\/site-guide\.svg/);
    assert.match(guideSource, /\/assets\/linewatch\/transportation-train\.svg/);
    assert.match(guideSource, /\/assets\/linewatch\/info-map-overlays\//);
    for (const assetName of infoOverlayAssetNames) {
      assert.match(guideSource, new RegExp(assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="suspension"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="delay"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="reduced-speed-zone"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="planned-closure"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="station-ring"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="overlap"/);
    assert.doesNotMatch(guideSource, /<MapOverlaySample kind="saved-commute"/);
    assert.doesNotMatch(guideSource, /title="Saved Commute"/);
    assert.match(guideSource, /aria-label="Open site guide"/);
    assert.match(guideSource, /role="dialog"/);
    assert.match(guideSource, /What LineWatch TO Does/);
    assert.match(guideSource, /Install LineWatch TO as an App/);
    assert.match(guideSource, /\/assets\/linewatch\/guide-icons\/share-iphone\.svg/);
    assert.match(guideSource, /\/assets\/linewatch\/guide-icons\/add-to-homescreen-android\.svg/);
    assert.match(guideSource, /site-guide-install-asset-icon/);
    assert.doesNotMatch(guideSource, /site-guide-install-asset-box/);
    assert.match(guideSource, /iPhone Safari/);
    assert.match(guideSource, /Open LineWatch TO in Safari/);
    assert.match(guideSource, /Tap Share/);
    assert.match(guideSource, /Add to Home Screen/);
    assert.match(guideSource, /Android Chrome/);
    assert.match(guideSource, /Open LineWatch TO in Chrome/);
    assert.match(guideSource, /Tap the three-dot menu/);
    assert.match(guideSource, /label: "Add to Home Screen"/);
    assert.doesNotMatch(guideSource, /label: "Install app"/);
    assert.doesNotMatch(guideSource, /<Share2 size=\{14\}/);
    assert.doesNotMatch(guideSource, /<Check size=\{14\}/);
    assert.match(guideSource, /Drag The Map/);
    assert.match(guideSource, /Click a Station/);
    assert.match(guideSource, /Click a Colored Overlay/);
    assert.match(guideSource, /Both Ways/);
    assert.match(guideSource, /Suspended or Closed Service/);
    assert.match(guideSource, /"Delay"/);
    assert.match(guideSource, /Reduced Speed Zone/);
    assert.match(guideSource, /Upcoming Closure Preview/);
    assert.match(guideSource, /Station Impact Ring/);
    assert.match(guideSource, /Overlap Badge/);
    assert.match(guideSource, /Shuttle Badge/);
    assert.match(guideSource, /Main Menu/);
    assert.match(guideSource, /Ingested TTC Alerts/);
  });

  it("adds scoped guide styles without broad theme churn", () => {
    assert.match(globalCss, /\.site-guide-panel/);
    assert.match(globalCss, /\.site-guide-trigger/);
    assert.match(globalCss, /\.site-guide-divider/);
    assert.doesNotMatch(globalCss, /\.site-guide-install-asset-box/);
    assert.doesNotMatch(globalCss, /filter:\s*brightness\(0\)\s*invert\(1\)/);
  });
});
