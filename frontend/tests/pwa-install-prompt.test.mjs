import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PWA_INSTALL_DISMISS_COOLDOWN_MS,
  canOfferPwaInstall,
  detectPwaInstallPlatform,
  isStandalonePwaDisplay,
  shouldShowPwaInstallNudge,
} from "../src/app/pwa-install-state.ts";

const hookSourceUrl = new URL("../src/hooks/usePwaInstallPrompt.ts", import.meta.url);
const nudgeSourceUrl = new URL("../src/components/PwaInstallNudge.tsx", import.meta.url);
const moreSheetSourceUrl = new URL("../src/components/MobileMoreSheet.tsx", import.meta.url);
const shellSourceUrl = new URL("../src/components/LineWatchShell.tsx", import.meta.url);
const globalCssUrl = new URL("../src/app/globals.css", import.meta.url);

describe("PWA install prompt state", () => {
  it("detects the mobile install platforms that LineWatchTO supports", () => {
    const androidChromeUa =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
    const androidFirefoxUa =
      "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0";
    const iphoneUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

    assert.equal(detectPwaInstallPlatform(androidChromeUa, "Linux armv8l", 5), "android-chromium");
    assert.equal(detectPwaInstallPlatform(androidFirefoxUa, "Linux armv8l", 5), "unsupported");
    assert.equal(detectPwaInstallPlatform(iphoneUa, "iPhone", 5), "ios");
    assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", "MacIntel", 5), "ios");
    assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", "MacIntel", 0), "unsupported");
  });

  it("detects standalone PWA display mode without relying on one browser only", () => {
    assert.equal(
      isStandalonePwaDisplay({
        matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" }),
        navigator: {},
      }),
      true,
    );
    assert.equal(
      isStandalonePwaDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      }),
      true,
    );
    assert.equal(
      isStandalonePwaDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      }),
      false,
    );
  });

  it("only offers install when the current platform has a real install path", () => {
    assert.equal(canOfferPwaInstall({ platform: "ios", nativePromptAvailable: false }), true);
    assert.equal(canOfferPwaInstall({ platform: "android-chromium", nativePromptAvailable: true }), true);
    assert.equal(canOfferPwaInstall({ platform: "android-chromium", nativePromptAvailable: false }), false);
    assert.equal(canOfferPwaInstall({ platform: "unsupported", nativePromptAvailable: true }), false);
  });

  it("requires mobile browser mode, engagement, no overlay conflict, and no fresh dismissal", () => {
    const base = {
      activeView: "map",
      blockedByOverlay: false,
      dismissedAt: null,
      engagementSignal: 1,
      isMobile: true,
      isStandalone: false,
      nativePromptAvailable: false,
      now: 1_800_000,
      platform: "ios",
      timedEngagement: false,
    };

    assert.equal(shouldShowPwaInstallNudge(base), true);
    assert.equal(shouldShowPwaInstallNudge({ ...base, isMobile: false }), false);
    assert.equal(shouldShowPwaInstallNudge({ ...base, isStandalone: true }), false);
    assert.equal(shouldShowPwaInstallNudge({ ...base, activeView: "status" }), false);
    assert.equal(shouldShowPwaInstallNudge({ ...base, blockedByOverlay: true }), false);
    assert.equal(shouldShowPwaInstallNudge({ ...base, engagementSignal: 0, timedEngagement: false }), false);
    assert.equal(shouldShowPwaInstallNudge({ ...base, engagementSignal: 0, timedEngagement: true }), true);
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        dismissedAt: base.now - PWA_INSTALL_DISMISS_COOLDOWN_MS + 1_000,
      }),
      false,
    );
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        dismissedAt: base.now - PWA_INSTALL_DISMISS_COOLDOWN_MS - 1_000,
      }),
      true,
    );
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        nativePromptAvailable: true,
        platform: "android-chromium",
      }),
      true,
    );
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        nativePromptAvailable: false,
        platform: "android-chromium",
      }),
      false,
    );
  });
});

describe("PWA install prompt hook", () => {
  it("listens for native install events, app installation, display-mode changes, and timed engagement", () => {
    const hookSource = readFileSync(hookSourceUrl, "utf8");

    assert.match(hookSource, /"use client"/);
    assert.match(hookSource, /beforeinstallprompt/);
    assert.match(hookSource, /event\.preventDefault\(\)/);
    assert.match(hookSource, /appinstalled/);
    assert.match(hookSource, /linewatch-pwa-install-dismissed-at-v1/);
    assert.match(hookSource, /PWA_INSTALL_ENGAGEMENT_DELAY_MS/);
    assert.match(hookSource, /isStandalonePwaDisplay/);
    assert.match(hookSource, /shouldShowPwaInstallNudge/);
    assert.match(hookSource, /deferredPrompt\.prompt\(\)/);
    assert.match(hookSource, /deferredPrompt\.userChoice/);
  });
});

