import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const chipPath = new URL("../src/components/SubwayClosingSoonChip.tsx", import.meta.url);
const previewScriptPath = new URL("../scripts/preview-closing-soon.mjs", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

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
    assert.match(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*height:\s*56px;/s);
    assert.match(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*min-height:\s*56px;/s);
    assert.doesNotMatch(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*min-height:\s*50px/s);
    assert.doesNotMatch(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*position:\s*fixed/s);
    assert.doesNotMatch(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*left:\s*50%/s);
    assert.doesNotMatch(globalCss, /\.subway-closing-soon-chip\s*\{[^}]*top:\s*88px/s);
    assert.match(globalCss, /#facc15/);
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
