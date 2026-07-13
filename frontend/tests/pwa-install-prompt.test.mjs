import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PWA_INSTALL_DISMISS_COOLDOWN_MS,
  canOfferPwaInstall,
  canShowPwaInstallHelp,
  detectPwaInstallPlatform,
  getPwaInstallHeading,
  getPwaInstallInstructionText,
  hasInstalledRelatedPwa,
  isStandalonePwaDisplay,
  shouldShowPwaInstallNudge,
} from "../src/app/pwa-install-state.ts";

const hookSourceUrl = new URL("../src/hooks/usePwaInstallPrompt.ts", import.meta.url);
const nudgeSourceUrl = new URL("../src/components/PwaInstallNudge.tsx", import.meta.url);
const moreSheetSourceUrl = new URL("../src/components/MobileMoreSheet.tsx", import.meta.url);
const shellSourceUrl = new URL("../src/components/LineWatchShell.tsx", import.meta.url);
const globalCssUrl = new URL("../src/app/globals.css", import.meta.url);
const iosGuideIconUrl = new URL("../public/assets/linewatch/guide-icons/share-iphone.svg", import.meta.url);
const androidGuideIconUrl = new URL("../public/assets/linewatch/guide-icons/add-to-homescreen-android.svg", import.meta.url);

describe("PWA install prompt state", () => {
  it("detects the mobile install platforms that LineWatchTO supports", () => {
    const androidChromeUa =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
    const androidFirefoxUa =
      "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0";
    const iphoneUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
    const iphoneChromeUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1";

    assert.equal(detectPwaInstallPlatform(androidChromeUa, "Linux armv8l", 5), "android-chrome");
    assert.equal(detectPwaInstallPlatform(androidFirefoxUa, "Linux armv8l", 5), "android-firefox");
    assert.equal(detectPwaInstallPlatform(iphoneUa, "iPhone", 5), "ios-safari");
    assert.equal(detectPwaInstallPlatform(iphoneChromeUa, "iPhone", 5), "ios-other");
    assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", "MacIntel", 5), "ios-safari");
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
    assert.equal(canOfferPwaInstall({ platform: "ios-safari", nativePromptAvailable: false }), true);
    assert.equal(canOfferPwaInstall({ platform: "ios-other", nativePromptAvailable: false }), false);
    assert.equal(canOfferPwaInstall({ platform: "android-chrome", nativePromptAvailable: true }), true);
    assert.equal(canOfferPwaInstall({ platform: "android-chrome", nativePromptAvailable: false }), false);
    assert.equal(canOfferPwaInstall({ platform: "android-chromium", nativePromptAvailable: true }), true);
    assert.equal(canOfferPwaInstall({ platform: "android-chromium", nativePromptAvailable: false }), false);
    assert.equal(canOfferPwaInstall({ platform: "android-firefox", nativePromptAvailable: true }), false);
    assert.equal(canOfferPwaInstall({ platform: "unsupported", nativePromptAvailable: true }), false);
  });

  it("shows install help only in supported mobile browser contexts", () => {
    assert.equal(canShowPwaInstallHelp({ platform: "ios-safari", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "ios-other", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "android-chrome", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "android-firefox", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "android-other", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "android-chromium", isMobile: true, isStandalone: false }), true);
    assert.equal(canShowPwaInstallHelp({ platform: "ios-safari", isMobile: true, isStandalone: true, hasInstalledRelatedPwa: false }), false);
    assert.equal(canShowPwaInstallHelp({ platform: "android-chrome", isMobile: true, isStandalone: true, hasInstalledRelatedPwa: false }), false);
    assert.equal(canShowPwaInstallHelp({ platform: "android-chrome", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: true }), false);
    assert.equal(canShowPwaInstallHelp({ platform: "ios-safari", isMobile: false, isStandalone: false, hasInstalledRelatedPwa: false }), false);
    assert.equal(canShowPwaInstallHelp({ platform: "unsupported", isMobile: true, isStandalone: false, hasInstalledRelatedPwa: false }), false);
  });

  it("recognizes an installed related web app returned by Chromium", () => {
    assert.equal(hasInstalledRelatedPwa([]), false);
    assert.equal(hasInstalledRelatedPwa([{ platform: "play", id: "com.example.linewatch" }]), false);
    assert.equal(hasInstalledRelatedPwa([{ platform: "webapp", id: "/", url: "/manifest.webmanifest" }]), true);
  });

  it("describes install steps for each supported mobile browser family", () => {
    assert.equal(getPwaInstallHeading("android-chrome"), "Install App for Android on Chrome");
    assert.equal(getPwaInstallHeading("ios-safari"), "Install App for iOS on Safari");
    assert.equal(getPwaInstallHeading("android-firefox"), "Install App for Android on Firefox");
    assert.equal(getPwaInstallHeading("android-other"), "Install App for Android on Other Browser");
    assert.equal(getPwaInstallInstructionText({ platform: "android-chrome", nativePromptAvailable: true }), "Tap Install, then confirm in Chrome.");
    assert.equal(getPwaInstallInstructionText({ platform: "android-chrome", nativePromptAvailable: false }), "Open the three-dot menu, tap Add to Home screen, then confirm.");
    assert.equal(getPwaInstallInstructionText({ platform: "ios-safari", nativePromptAvailable: false }), "Tap Share, choose Add to Home Screen, then tap Add.");
    assert.equal(getPwaInstallInstructionText({ platform: "ios-other", nativePromptAvailable: false }), "Open this page in Safari, tap Share, then Add to Home Screen.");
  });

  it("requires mobile browser mode, engagement, no overlay conflict, and no fresh dismissal", () => {
    const base = {
      activeView: "map",
      blockedByOverlay: false,
      dismissedAt: null,
      engagementSignal: 1,
      isMobile: true,
      isStandalone: false,
      hasInstalledRelatedPwa: false,
      nativePromptAvailable: false,
      now: 1_800_000,
      platform: "ios-safari",
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
        platform: "android-chrome",
      }),
      true,
    );
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        nativePromptAvailable: false,
        platform: "android-chrome",
      }),
      true,
    );
    assert.equal(
      shouldShowPwaInstallNudge({
        ...base,
        nativePromptAvailable: false,
        platform: "android-firefox",
      }),
      true,
    );
    assert.equal(shouldShowPwaInstallNudge({ ...base, hasInstalledRelatedPwa: true }), false);
  });
});

describe("PWA install prompt hook", () => {
  it("listens for native install events, app installation, display-mode changes, and timed engagement", () => {
    const hookSource = readFileSync(hookSourceUrl, "utf8");

    assert.match(hookSource, /"use client"/);
    assert.match(hookSource, /beforeinstallprompt/);
    assert.match(hookSource, /event\.preventDefault\(\)/);
    assert.match(hookSource, /appinstalled/);
    assert.match(hookSource, /getInstalledRelatedApps/);
    assert.match(hookSource, /hasInstalledRelatedPwa/);
    assert.match(hookSource, /linewatch-pwa-install-dismissed-at-v1/);
    assert.match(hookSource, /PWA_INSTALL_ENGAGEMENT_DELAY_MS/);
    assert.match(hookSource, /canShowPwaInstallHelp/);
    assert.match(hookSource, /canShowInstallHelp/);
    assert.match(hookSource, /isStandalonePwaDisplay/);
    assert.match(hookSource, /shouldShowPwaInstallNudge/);
    assert.match(hookSource, /deferredPrompt\.prompt\(\)/);
    assert.match(hookSource, /deferredPrompt\.userChoice/);
  });
});

describe("PWA install nudge component", () => {
  it("renders Android native install copy and manual Home Screen instructions", () => {
    const nudgeSource = readFileSync(nudgeSourceUrl, "utf8");

    assert.match(nudgeSource, /export function PwaInstallNudge/);
    assert.match(nudgeSource, /aria-label="Install LineWatchTO"/);
    assert.match(nudgeSource, /Add LineWatchTO to your home screen/);
    assert.match(nudgeSource, /instructionText/);
    assert.match(nudgeSource, /Install/);
    assert.match(nudgeSource, /Got it/);
    assert.match(nudgeSource, /Tap Share/);
    assert.match(nudgeSource, /Add to Home Screen/);
    assert.match(nudgeSource, /Android install steps/);
    assert.match(nudgeSource, /Open menu/);
    assert.match(nudgeSource, /getPwaInstallInstructionText/);
    assert.match(nudgeSource, /\/assets\/linewatch\/guide-icons\/share-iphone\.svg/);
    assert.match(nudgeSource, /\/assets\/linewatch\/guide-icons\/add-to-homescreen-android\.svg/);
    assert.match(nudgeSource, /aria-label="Dismiss install prompt"/);
  });
});

describe("PWA install entry in More sheet", () => {
  it("keeps a persistent install action available in mobile More options", () => {
    const moreSheetSource = readFileSync(moreSheetSourceUrl, "utf8");

    assert.match(moreSheetSource, /PwaInstallPlatform/);
    assert.match(moreSheetSource, /canOfferPwaInstall/);
    assert.match(moreSheetSource, /canShowPwaInstallHelp/);
    assert.match(moreSheetSource, /getPwaInstallHeading/);
    assert.match(moreSheetSource, /getPwaInstallInstructionText/);
    assert.match(moreSheetSource, /onRequestPwaInstall/);
    assert.match(moreSheetSource, /Install LineWatchTO/);
    assert.match(moreSheetSource, /<h3>\{installHelpHeading\}<\/h3>/);
    assert.match(moreSheetSource, /canShowPwaInstallHelp \? \(/);
    assert.match(moreSheetSource, /mobile-more-install-section/);
    assert.match(moreSheetSource, /Notifications Help[\s\S]*mobile-more-install-help/);
    assert.ok(
      moreSheetSource.indexOf("Install LineWatchTO") < moreSheetSource.indexOf("<h3>Account</h3>"),
      "Install reminder should remain near the top of More when it is visible.",
    );
  });
});

describe("PWA install shell wiring", () => {
  it("tracks mobile engagement, renders the nudge, and suppresses status peek while the nudge is visible", () => {
    const shellSource = readFileSync(shellSourceUrl, "utf8");

    assert.match(shellSource, /usePwaInstallPrompt/);
    assert.match(shellSource, /PwaInstallNudge/);
    assert.match(shellSource, /pwaEngagementSignal/);
    assert.match(shellSource, /recordPwaInstallEngagement/);
    assert.match(shellSource, /showPwaInstallNudge/);
    assert.match(shellSource, /!showPwaInstallNudge[\s\S]*<MobileStatusPeek/);
    assert.match(shellSource, /canOfferPwaInstall=\{pwaInstallPrompt\.canOfferInstall\}/);
    assert.match(shellSource, /canShowPwaInstallHelp=\{pwaInstallPrompt\.canShowInstallHelp\}/);
    assert.match(shellSource, /onRequestPwaInstall=\{pwaInstallPrompt\.requestInstall\}/);
  });
});

describe("PWA share entry in More sheet", () => {
  it("keeps a mobile share action available for standalone PWA users", () => {
    const moreSheetSource = readFileSync(moreSheetSourceUrl, "utf8");
    const shellSource = readFileSync(shellSourceUrl, "utf8");

    assert.match(moreSheetSource, /Share2/);
    assert.match(moreSheetSource, /onShareApp/);
    assert.match(moreSheetSource, /shareStatusLabel/);
    assert.match(moreSheetSource, /Share LineWatchTO/);
    assert.match(moreSheetSource, /Send app link to friends/);
    assert.match(moreSheetSource, /mobile-more-share-status/);
    assert.match(moreSheetSource, /Support & About/);
    assert.ok(
      moreSheetSource.indexOf("<h3>Display</h3>") < moreSheetSource.indexOf("Support & About"),
      "Share and support actions should appear after display preferences.",
    );
    assert.ok(
      moreSheetSource.indexOf("Support & About") < moreSheetSource.indexOf("Share LineWatchTO"),
      "Share action should sit under Support & About.",
    );
    assert.match(shellSource, /handleShareLineWatchApp/);
    assert.match(shellSource, /navigator\.share/);
    assert.match(shellSource, /navigator\.clipboard\.writeText/);
    assert.match(shellSource, /onShareApp=\{handleShareLineWatchApp\}/);
  });
});

describe("PWA install prompt styles", () => {
  it("adds scoped mobile styles without changing the core PWA manifest or guide styles", () => {
    const globalCss = readFileSync(globalCssUrl, "utf8");

    assert.match(globalCss, /\.pwa-install-nudge/);
    assert.match(globalCss, /bottom:\s*calc\(var\(--mobile-bottom-nav-occupied-height\)/);
    assert.match(globalCss, /\.pwa-install-nudge-primary/);
    assert.match(globalCss, /\.pwa-install-nudge-dismiss/);
    assert.match(globalCss, /\.mobile-more-install-row/);
    assert.match(globalCss, /\.mobile-more-install-help/);
    assert.match(globalCss, /\.motion-paused \.pwa-install-nudge/);
    assert.match(globalCss, /\.high-contrast \.pwa-install-nudge/);
    assert.match(globalCss, /\.pwa-install-nudge\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.97\);[^}]*color:\s*#0f172a;/s);
    assert.match(globalCss, /\.dark \.pwa-install-nudge\s*\{[^}]*background:\s*rgba\(10, 12, 16, 0\.96\);[^}]*color:\s*#ffffff;/s);
  });

  it("keeps install guide assets visible in both themes", () => {
    const iosGuideIcon = readFileSync(iosGuideIconUrl, "utf8");
    const androidGuideIcon = readFileSync(androidGuideIconUrl, "utf8");

    assert.match(iosGuideIcon, /stroke="#475569"/);
    assert.match(iosGuideIcon, /stroke="#ffffff"/);
    assert.match(androidGuideIcon, /stroke="#475569"/);
    assert.match(androidGuideIcon, /stroke="#ffffff"/);
  });
});
