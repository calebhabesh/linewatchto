import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const disclaimerPath = new URL("../src/components/OpeningDisclaimer.tsx", import.meta.url);
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("opening disclaimer", () => {
  it("defines a first-visit TTC affiliation acknowledgement", () => {
    assert.ok(existsSync(disclaimerPath), "OpeningDisclaimer component should exist");

    const disclaimerSource = readFileSync(disclaimerPath, "utf8");

    assert.match(disclaimerSource, /linewatch-disclaimer-ack-v1/);
    assert.match(disclaimerSource, /localStorage/);
    assert.match(disclaimerSource, /role="dialog"/);
    assert.match(disclaimerSource, /aria-modal="true"/);
    assert.match(disclaimerSource, /AlertTriangle/);
    assert.match(disclaimerSource, /personal project/);
    assert.match(disclaimerSource, /not affiliated with, endorsed by, or operated by the TTC/);
    assert.match(disclaimerSource, /opening-disclaimer-highlight/);
    assert.match(disclaimerSource, /TTC(?:&apos;|')s public Live Alerts endpoint/);
    assert.match(disclaimerSource, /local fixture data/);
    assert.doesNotMatch(disclaimerSource, /Personal project disclaimer/);
    assert.doesNotMatch(disclaimerSource, /not an official TTC source/);
    assert.match(disclaimerSource, /I Understand/);
  });

  it("mounts the disclaimer above the dashboard with bottom-centered styling", () => {
    assert.match(shellSource, /OpeningDisclaimer/);
    assert.match(globalCss, /\.opening-disclaimer-backdrop/);
    assert.match(globalCss, /\.opening-disclaimer-panel/);
    assert.match(globalCss, /align-items:\s*flex-end/);
    assert.match(globalCss, /justify-content:\s*center/);
    assert.match(globalCss, /z-index:\s*80/);
    assert.match(globalCss, /\.opening-disclaimer-highlight/);
    assert.match(globalCss, /\.opening-disclaimer-panel button\s*\{[^}]*background:\s*#facc15;/s);
    assert.match(globalCss, /\.opening-disclaimer-panel button\s*\{[^}]*color:\s*#111827;/s);
  });
});
