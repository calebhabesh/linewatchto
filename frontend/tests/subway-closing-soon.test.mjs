import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const chipPath = new URL("../src/components/SubwayClosingSoonChip.tsx", import.meta.url);
const previewScriptPath = new URL("../scripts/preview-closing-soon.mjs", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mobileLegendSource = readFileSync(new URL("../src/components/MobileLegend.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const baseClosingSoonChipCss = globalCss.match(/\.subway-closing-soon-chip\s*\{[^}]*\}/s)?.[0] ?? "";
const sharedMobileAnnouncementCss = Array.from(
  globalCss.matchAll(/\.subway-closing-soon-chip,\s*\.subway-closed-peek-chip\s*\{[^}]*\}/gs)
).at(-1)?.[0] ?? "";
const narrowRotateMapCss = globalCss.match(/@media \(max-width:\s*480px\)\s*\{[\s\S]*?\.mobile-legend-pill--expanded/s)?.[0] ?? "";

describe("subway closing soon chip", () => {
  it("renders a passive countdown status from the operating-hours state", () => {
    assert.ok(existsSync(chipPath), "SubwayClosingSoonChip component should exist");

    const chipSource = readFileSync(chipPath, "utf8");

    assert.match(chipSource, /Subway Closing Soon/);
    assert.match(chipSource, /formatResumeDuration\(minutesUntilClose\)/);
    assert.match(chipSource, /nextCloseLabel/);
    assert.match(chipSource, /role="status"/);
    assert.match(chipSource, /aria-live="polite"/);
    assert.match(chipSource, /Clock/);
  });

  it("mounts beside the station search button during the open-state closing window", () => {
    assert.match(shellSource, /SubwayClosingSoonChip/);
    assert.match(shellSource, /subwayOperatingState\.closingSoon/);
    assert.match(shellSource, /subwayOperatingState\.minutesUntilClose !== null/);
    assert.match(shellSource, /subwayOperatingState\.nextCloseLabel/);
    assert.match(shellSource, /aria-label="Search stations"[\s\S]*SubwayClosingSoonChip[\s\S]*Floating Dropdown Menu/);
    assert.match(globalCss, /\.subway-closing-soon-chip/);
    assert.match(globalCss, /flex:\s*0 1/);
    assert.match(baseClosingSoonChipCss, /height:\s*56px;/);
    assert.match(baseClosingSoonChipCss, /min-height:\s*56px;/);
    assert.doesNotMatch(baseClosingSoonChipCss, /min-height:\s*50px/);
    assert.doesNotMatch(baseClosingSoonChipCss, /position:\s*fixed/);
    assert.doesNotMatch(baseClosingSoonChipCss, /left:\s*50%/);
    assert.doesNotMatch(baseClosingSoonChipCss, /top:\s*88px/);
    assert.match(globalCss, /#facc15/);
  });

  it("keeps mobile announcements on the same top axis as map controls without squeezing text", () => {
    assert.match(globalCss, /--mobile-announcement-chip-height:\s*40px/);
    assert.match(globalCss, /--mobile-top-chrome-height:\s*40px/);
    assert.match(globalCss, /--mobile-edge-inset:\s*clamp\(10px,\s*4vw,\s*16px\)/);
    assert.match(globalCss, /--mobile-top-action-button-size:\s*clamp\(34px,\s*10\.7vw,\s*40px\)/);
    assert.match(globalCss, /--mobile-rotate-action-width:\s*clamp\(62px,\s*20vw,\s*76px\)/);
    assert.match(globalCss, /--mobile-top-action-cluster-width:\s*calc\(var\(--mobile-top-action-button-size\)/);
    assert.match(sharedMobileAnnouncementCss, /top:\s*var\(--mobile-edge-inset\)/);
    assert.match(sharedMobileAnnouncementCss, /left:\s*var\(--mobile-edge-inset\)/);
    assert.match(sharedMobileAnnouncementCss, /right:\s*auto/);
    assert.match(sharedMobileAnnouncementCss, /max-width:\s*var\(--mobile-announcement-max-width\)/);
    assert.match(sharedMobileAnnouncementCss, /width:\s*min\(/);
    assert.match(sharedMobileAnnouncementCss, /100vw - var\(--mobile-edge-inset\) - var\(--mobile-top-action-cluster-width\) - var\(--mobile-announcement-gap\) - var\(--mobile-edge-inset\)/);
    assert.match(sharedMobileAnnouncementCss, /height:\s*var\(--mobile-announcement-chip-height\)/);
    assert.match(globalCss, /\.linewatch-shell > header\s*\{[\s\S]*padding:\s*var\(--mobile-edge-inset\)/);
    assert.match(globalCss, /\.map-utility-cluster\s*\{[\s\S]*gap:\s*var\(--mobile-top-action-gap\)/);
    assert.match(globalCss, /\.theme-toggle-btn,[\s\S]*\.site-guide-trigger\s*\{[\s\S]*height:\s*var\(--mobile-top-action-button-size\)/);
    assert.match(globalCss, /\.mobile-legend-pill--announcement/);
    assert.match(mobileLegendSource, /mobile-legend-pill--announcement/);
    assert.doesNotMatch(globalCss, /max-width:\s*calc\(100vw - 16px - \d+px\)/);
    assert.doesNotMatch(globalCss, /flex-basis:\s*max\([^;]*calc\(100vw - 168px\)/);
  });

  it("keeps the mobile rotate-map button text visible on narrow phones", () => {
    assert.match(shellSource, /Rotate<br\s*\/>\s*Map/);
    assert.match(globalCss, /\.rotate-map-btn svg\s*\{[\s\S]*height:\s*clamp\(20px,\s*6\.5vw,\s*24px\)\s*!important/);
    assert.match(globalCss, /\.rotate-map-btn svg\s*\{[\s\S]*width:\s*clamp\(20px,\s*6\.5vw,\s*24px\)\s*!important/);
    assert.match(globalCss, /\.rotate-map-btn svg\s*\{[\s\S]*flex:\s*0 0 auto\s*!important/);
    assert.match(narrowRotateMapCss, /\.rotate-map-btn\s*\{[\s\S]*width:\s*var\(--mobile-rotate-action-width\)/);
    assert.match(narrowRotateMapCss, /\.rotate-map-btn span\s*\{[\s\S]*display:\s*inline-block\s*!important/);
    assert.match(narrowRotateMapCss, /\.rotate-map-btn span\s*\{[\s\S]*font-size:\s*clamp\(6\.5px,\s*2\.15vw,\s*8px\)\s*!important/);
    assert.match(narrowRotateMapCss, /\.rotate-map-btn span\s*\{[\s\S]*letter-spacing:\s*0\.02em\s*!important/);
    assert.doesNotMatch(narrowRotateMapCss, /\.rotate-map-btn span\s*\{[\s\S]*display:\s*none\s*!important/);
  });

  it("provides a manual browser preview URL near closing", () => {
    assert.equal(packageJson.scripts["preview:closing-soon"], "node scripts/preview-closing-soon.mjs");
    assert.ok(existsSync(previewScriptPath), "manual preview script should exist");

    const previewScript = readFileSync(previewScriptPath, "utf8");

    assert.match(previewScript, /2026-06-04T00:45:00-04:00/);
    assert.match(previewScript, /searchParams\.set\("previewTime"/);
    assert.match(previewScript, /linewatch-disclaimer-ack-v1/);
    assert.match(previewScript, /Subway Closing Soon/);
    assert.match(previewScript, /Press Enter to close/);
  });
});
