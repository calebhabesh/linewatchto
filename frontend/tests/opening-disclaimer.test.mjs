import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const onboardingPath = new URL("../src/components/OpeningDisclaimer.tsx", import.meta.url);
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(onboardingPath, "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("first-visit welcome experience", () => {
  it("separates the welcome carousel from the unofficial-project acknowledgement", () => {
    assert.ok(existsSync(onboardingPath), "OpeningDisclaimer component should exist");
    assert.match(onboardingSource, /linewatch-welcome-seen-v1/);
    assert.match(onboardingSource, /linewatch-unofficial-notice-ack-v1/);
    assert.match(onboardingSource, /aria-label="Welcome to LineWatchTO"/);
    assert.match(onboardingSource, /aria-modal="true"/);
    assert.match(onboardingSource, /Unofficial Personal Project/);
    assert.match(onboardingSource, /TTC or Metrolinx/);
    assert.match(onboardingSource, /Information may be delayed or unavailable/);
    assert.match(onboardingSource, /Got it/);
  });

  it("provides three desktop slides and four mobile slides with curated images", () => {
    assert.match(onboardingSource, /DESKTOP_SLIDE_COUNT = 3/);
    assert.match(onboardingSource, /MOBILE_SLIDE_COUNT = 4/);
    assert.match(onboardingSource, /Read the Live Map/);
    assert.match(onboardingSource, /Explore an Impact/);
    assert.match(onboardingSource, /Make It Yours/);
    assert.match(onboardingSource, /Monitor My Commutes/);
    assert.match(onboardingSource, /Watch My Stations/);
    assert.match(onboardingSource, /desktop-map-guide\.png/);
    assert.match(onboardingSource, /desktop-impact-details\.png/);
    assert.match(onboardingSource, /desktop-my-commutes\.png/);
    assert.match(onboardingSource, /desktop-my-stations\.png/);
    assert.match(onboardingSource, /mobile-map-guide\.png/);
    assert.match(onboardingSource, /mobile-impact-details\.png/);
    assert.match(onboardingSource, /mobile-my-commutes\.png/);
    assert.match(onboardingSource, /mobile-my-stations\.png/);
  });

  it("uses stable responsive slide stages and accessible manual controls", () => {
    assert.match(onboardingSource, /Choose an introduction slide/);
    assert.match(onboardingSource, /Go to slide/);
    assert.match(onboardingSource, /Explore dashboard/);
    assert.match(onboardingSource, /Create a free account/);
    assert.match(globalCss, /\.opening-welcome-slide\s*\{[^}]*min-height:\s*372px;/s);
    assert.match(globalCss, /\.opening-welcome-personal-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    assert.match(globalCss, /\.opening-welcome-image-frame--mobile\s*\{[^}]*aspect-ratio:\s*4 \/ 3;/s);
    assert.match(globalCss, /\.opening-welcome-carousel--desktop\s*\{[^}]*display:\s*none;/s);
    assert.match(onboardingSource, /requestAnimationFrame/);
    assert.match(onboardingSource, /opening-welcome-panel--entrance-ready/);
    assert.match(globalCss, /animation:\s*opening-welcome-card-enter 620ms/);
    assert.match(globalCss, /@keyframes opening-welcome-card-enter\s*\{/);
    assert.match(globalCss, /\.opening-unofficial-notice\s*\{[^}]*align-items:\s*center;/s);
    assert.match(globalCss, /\.opening-unofficial-notice--exiting\s*\{/);
    assert.match(globalCss, /@keyframes opening-unofficial-notice-exit\s*\{/);
    assert.match(shellSource, /deferInitialEntrance=\{disclaimerVisible/);
  });
});
