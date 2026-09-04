import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const guideComponentUrl = new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url);
const logsComponentUrl = new URL("../src/components/LogsDropdown.tsx", import.meta.url);
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
  "info-one-way-closure.svg",
  "info-upcoming-closure.svg",
  "station-ring-arrow.svg",
  "station-ring-two-way-arrow.svg",
  "info-overlapping-multi-marker.svg",
  "info-overlapping-single-marker.svg",
];

describe("site guide dropdown", () => {
  it("animates utility popovers through both open and close lifecycles", () => {
    const guideSource = readFileSync(guideComponentUrl, "utf8");
    const logsSource = readFileSync(logsComponentUrl, "utf8");

    for (const source of [guideSource, logsSource]) {
      assert.match(source, /utility-popover--closing/);
      assert.match(source, /utility-popover--opening/);
      assert.match(source, /data-popover-state=/);
      assert.match(source, /prefers-reduced-motion: reduce/);
      assert.match(source, /reducedMotion \? 0 : 220/);
    }
    assert.match(globalCss, /\.utility-popover--opening\s*\{[^}]*utility-popover-enter 280ms/s);
    assert.match(globalCss, /\.utility-popover--closing\s*\{[^}]*utility-popover-exit 220ms/s);
    assert.match(globalCss, /@keyframes utility-popover-enter/);
    assert.match(globalCss, /@keyframes utility-popover-exit/);
  });

  it("uses a red activity icon for source status while keeping the mobile More icon neutral", () => {
    const logsSource = readFileSync(logsComponentUrl, "utf8");

    assert.doesNotMatch(logsSource, /Newspaper/);
    assert.match(logsSource, /<Activity[\s\S]*?isMobileMore[\s\S]*?text-slate-500 dark:text-slate-400[\s\S]*?text-red-600 dark:text-red-400/);
  });

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

  it("shows the current planned-closure rail and alert-calendar symbol", () => {
    const plannedClosureAsset = readFileSync(
      new URL("../public/assets/linewatch/info-map-overlays/info-upcoming-closure.svg", import.meta.url),
      "utf8",
    );

    assert.match(plannedClosureAsset, /fill="#f1f5f9"/);
    assert.doesNotMatch(plannedClosureAsset, /fill-opacity=/);
    assert.match(plannedClosureAsset, /stroke="#3b82f6"/);
    assert.match(plannedClosureAsset, /<rect x="3" y="5" width="18" height="16" rx="3"\/>/);
    assert.match(plannedClosureAsset, /M3 9H21M12 12V15M12 18H12\.01/);

    const directionalClosureAsset = readFileSync(
      new URL("../public/assets/linewatch/info-map-overlays/info-one-way-closure.svg", import.meta.url),
      "utf8",
    );
    assert.match(directionalClosureAsset, /id="planned-closure-icon"/);
    assert.match(directionalClosureAsset, /id="planned-closure-chevron"/);
    assert.match(directionalClosureAsset, /stroke="#3b82f6"/);
  });

  it("uses the no-entry bidirectional active alert guide asset", () => {
    const activeAsset = readFileSync(
      new URL("../public/assets/linewatch/info-map-overlays/2-way-active.svg", import.meta.url),
      "utf8",
    );

    assert.match(activeAsset, /id="path3"/);
    assert.match(activeAsset, /id="path3-7"/);
    assert.match(activeAsset, /id="path3-7-3"/);
    assert.match(activeAsset, /fill:#ef4444/);
    assert.doesNotMatch(activeAsset, /fill:#ffffff;fill-opacity:1;stroke:none/);
    assert.doesNotMatch(activeAsset, /M 62\.293499 55\.283695 L 106\.574 88\.807747/);
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
    for (const fileName of ["station-ring-arrow.svg", "station-ring-two-way-arrow.svg"]) {
      const asset = readFileSync(
        new URL(`../public/assets/linewatch/info-map-overlays/${fileName}`, import.meta.url),
        "utf8",
      );

      assert.match(asset, /viewBox="0 0 31\.637878 31\.637878"/);
      assert.match(asset, /id="path1"[\s\S]*inkscape:label="inner-circle"/);
      assert.match(asset, /id="path2"[\s\S]*inkscape:label="golden-outer-ring"/);
      assert.match(asset, /fill:#ffffff/);
      assert.match(asset, /stroke:#000000/);
      assert.match(asset, /stroke:#facc15/);
      assert.doesNotMatch(asset, /station-ring-gold-halo/);
      assert.doesNotMatch(asset, /station-ring-red-glow/);
      assert.doesNotMatch(asset, /station-ring-static-pulse/);
      assert.doesNotMatch(asset, /<animate\b/);
    }
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
    assert.match(guideSource, /What LineWatchTO Does/);
    assert.match(guideSource, /Install LineWatchTO as an App/);
    assert.match(guideSource, /\/assets\/linewatch\/guide-icons\/share-iphone\.svg/);
    assert.match(guideSource, /\/assets\/linewatch\/guide-icons\/add-to-homescreen-android\.svg/);
    assert.match(guideSource, /site-guide-install-asset-icon/);
    assert.doesNotMatch(guideSource, /site-guide-install-asset-box/);
    assert.match(guideSource, /iOS Safari \(iPhone\)/);
    assert.match(guideSource, /Open LineWatchTO in Safari/);
    assert.match(guideSource, /Tap Share/);
    assert.match(guideSource, /Add to Home Screen/);
    assert.match(guideSource, /Android Chrome/);
    assert.match(guideSource, /Open LineWatchTO in Chrome/);
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
    assert.match(guideSource, /both ways shows centered no-entry icons/);
    assert.doesNotMatch(guideSource, /both ways shows a red-and-white striped lane/);
    assert.match(guideSource, /"Delay"/);
    assert.match(guideSource, /Reduced Speed Zone/);
    assert.match(guideSource, /Planned Closure Preview/);
    assert.match(guideSource, /Both ways stays static/);
    assert.match(guideSource, /explicitly one-way closure uses slowly moving calendars followed by evenly spaced chevrons/);
    assert.match(guideSource, /info-one-way-closure\.svg" label="One Way"/);
    assert.match(guideSource, /info-upcoming-closure\.svg" label="Both Ways"/);
    assert.match(guideSource, /block w-full text-center text-\[9px\] leading-tight/);
    assert.match(guideSource, /Station Impact Ring/);
    assert.match(guideSource, /Overlap Badge/);
    assert.match(guideSource, /Shuttle Badge/);
    assert.match(guideSource, /Main Menu/);
    assert.match(guideSource, /TTC Source Status/);
    assert.doesNotMatch(guideSource, /raw alert feed/i);
  });

  it("adds scoped guide styles without broad theme churn", () => {
    assert.match(globalCss, /\.site-guide-panel/);
    assert.match(globalCss, /\.site-guide-panel\s*\{[\s\S]*?border:\s*none !important;/);
    assert.doesNotMatch(globalCss, /\.linewatch-shell\.high-contrast \.site-guide-panel[\s\S]*?border:\s*1px solid/);
    assert.match(globalCss, /\.source-status-panel\s*\{[\s\S]*?border:\s*none !important;/);
    assert.match(globalCss, /\.source-status-card\s*\{[\s\S]*?border:\s*none !important;[\s\S]*?var\(--mobile-card-shadow\)/);
    assert.match(globalCss, /\.site-guide-trigger/);
    assert.match(globalCss, /\.site-guide-divider/);
    assert.doesNotMatch(globalCss, /\.site-guide-install-asset-box/);
    assert.doesNotMatch(globalCss, /filter:\s*brightness\(0\)\s*invert\(1\)/);
  });

  it("applies the hamburger flash pulse to the site guide icon itself and matches sibling button sizing", () => {
    const guideSource = readFileSync(guideComponentUrl, "utf8");
    assert.match(guideSource, /className="site-guide-trigger panel flex/);
    assert.doesNotMatch(guideSource, /site-guide-trigger[^"]*menu-attention-beam/);
    assert.match(guideSource, /data-menu-attention=\{/);
    assert.match(guideSource, /width=\{24\}\s+height=\{24\}\s+className="site-guide-trigger-icon"/);
    assert.match(globalCss, /\.site-guide-trigger:not\(\[data-menu-attention="false"\]\) \.site-guide-trigger-icon\s*\{[^}]*animation:\s*menu-border-pulse 2\.8s cubic-bezier/);
    assert.doesNotMatch(globalCss, /smooth-breath/);
    assert.doesNotMatch(globalCss, /animation:\s*smooth-breath/);
  });
});
