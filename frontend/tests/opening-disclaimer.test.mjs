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
    assert.match(disclaimerSource, /<span>Welcome to<\/span>/);
    assert.match(disclaimerSource, /<strong>LineWatchTO<\/strong>/);
    assert.match(disclaimerSource, /assets\/linewatch\/logo\.svg/);
    assert.match(disclaimerSource, /opening-disclaimer-strip/);
    assert.match(disclaimerSource, /linewatch-transit-accent-strip/);
    assert.match(disclaimerSource, /opening-disclaimer-divider/);
    assert.match(disclaimerSource, /station-arrival-line-divider/);
    assert.match(disclaimerSource, /AlertTriangle/);
    assert.match(disclaimerSource, /personal project/);
    assert.match(disclaimerSource, /not affiliated with, endorsed by, or operated by the TTC/);
    assert.match(disclaimerSource, /opening-disclaimer-highlight/);
    assert.match(disclaimerSource, /TTC(?:&apos;|')s public Live Alerts endpoint/);
    assert.match(disclaimerSource, /local fixture data/);
    assert.match(disclaimerSource, /opening-disclaimer-nudge/);
    assert.match(disclaimerSource, /free account/);
    assert.match(disclaimerSource, /opening-disclaimer-account-link/);
    assert.match(disclaimerSource, /handleCreateAccountClick/);
    assert.match(disclaimerSource, /Google/i);
    assert.doesNotMatch(disclaimerSource, /Personal project disclaimer/);
    assert.doesNotMatch(disclaimerSource, /not an official TTC source/);
    assert.match(disclaimerSource, /I Understand/);
  });

  it("mounts the disclaimer above the dashboard with centered branded styling", () => {
    assert.match(shellSource, /OpeningDisclaimer/);
    assert.match(shellSource, /onOpenCreateAccount=/);
    assert.match(globalCss, /\.opening-disclaimer-backdrop/);
    assert.match(globalCss, /\.opening-disclaimer-panel/);
    assert.match(globalCss, /align-items:\s*center/);
    assert.match(globalCss, /justify-content:\s*center/);
    assert.match(globalCss, /z-index:\s*80/);
    assert.match(globalCss, /\.opening-disclaimer-strip/);
    assert.match(globalCss, /\.linewatch-transit-accent-strip/);
    assert.match(globalCss, /grid-template-columns:\s*repeat\(5, 1fr\)/);
    assert.match(globalCss, /#8a999a/);
    assert.match(globalCss, /\.opening-disclaimer-welcome/);
    assert.match(globalCss, /\.opening-disclaimer-nudge/);
    assert.match(globalCss, /\.opening-disclaimer-nudge-mobile/);
    assert.match(globalCss, /\.opening-disclaimer-nudge-desktop/);
    assert.match(globalCss, /\.opening-disclaimer-account-link/);
    assert.match(globalCss, /\.station-arrival-line-divider/);
    assert.match(globalCss, /\.opening-disclaimer-panel\s*\{[^}]*background:\s*var\(--panel\);/s);
    assert.match(globalCss, /\.opening-disclaimer-divider\s*\{[^}]*border-radius:\s*999px;[^}]*overflow:\s*hidden;/s);
    assert.match(globalCss, /\.opening-disclaimer-highlight/);
    assert.match(globalCss, /\.opening-disclaimer-ack-button\s*\{[^}]*background:\s*#facc15;/s);
    assert.match(globalCss, /\.opening-disclaimer-ack-button\s*\{[^}]*color:\s*#111827;/s);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.opening-disclaimer-panel\s*\{[^}]*width:\s*min\(94vw, 380px\);/);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.opening-disclaimer-logo\s*\{[^}]*height:\s*76px;[^}]*width:\s*76px;/);
  });

  it("keeps the map centered until the welcome overlay reveals it", () => {
    assert.match(shellSource, /deferInitialEntrance=\{disclaimerVisible/);
  });
});
