# PWA Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discoverable, respectful mobile PWA install prompt for LineWatchTO that only appears to mobile browser users who are not already running the installed app.

**Architecture:** Keep install eligibility and suppression logic in a small pure utility module, use a client hook to capture platform/browser install signals, and render a mobile-only install nudge from the main shell. Android Chromium uses the native `beforeinstallprompt` flow; iOS gets clear Add to Home Screen instructions because Safari/WebKit does not expose an equivalent one-tap prompt.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind utility classes where already present, plain CSS in `frontend/src/app/globals.css`, Node built-in test runner.

---

## Product Behavior

- Show no install prompt when LineWatchTO is already running in standalone/fullscreen/minimal-ui PWA display mode.
- Show no install prompt on desktop.
- Show no install prompt immediately on first paint.
- Show the nudge only after one engagement signal: tapping a mobile nav item, tapping a map impact, selecting a station, or staying in the mobile app for 25 seconds.
- Do not cover active map inspectors, station details, account dialogs, commute path previews, rotated map mode, or the closed-screen view.
- When the nudge appears on the map, temporarily replace `MobileStatusPeek` rather than stacking another floating panel above the bottom nav.
- Android Chromium CTA: `Install`, which calls the captured `beforeinstallprompt` event.
- iOS CTA: show inline instructions with `Share` and `Add to Home Screen`; the CTA is `Got it`.
- Dismissal stores a local 14-day cooldown in `localStorage`.
- Keep a permanent install/help row in the mobile More sheet while the user is in a mobile browser and install guidance is available.

## File Structure

- Create `frontend/src/app/pwa-install-state.ts`
  - Pure platform detection, standalone detection, localStorage parsing/writing, and nudge eligibility.
- Create `frontend/src/hooks/usePwaInstallPrompt.ts`
  - Client hook that listens for `beforeinstallprompt`, `appinstalled`, display-mode changes, and the 25-second engagement timer.
- Create `frontend/src/components/PwaInstallNudge.tsx`
  - Mobile floating nudge UI for Android native install and iOS manual instructions.
- Modify `frontend/src/components/MobileMoreSheet.tsx`
  - Add a persistent install row and iOS mini-steps when eligible.
- Modify `frontend/src/components/LineWatchShell.tsx`
  - Track engagement, invoke the hook, pass install props to More sheet, and render the nudge.
- Modify `frontend/src/app/globals.css`
  - Add scoped styles for the nudge and More-sheet install rows.
- Create `frontend/tests/pwa-install-prompt.test.mjs`
  - Unit and source tests for platform detection, eligibility, hook event wiring, component copy, and CSS selectors.

## Guardrails

- Do not present LineWatchTO as an official TTC app.
- Do not claim App Store or Play Store availability.
- Do not ask for notification permission as part of install promotion.
- Do not show the nudge over live service alerts, station details, commute route previews, or auth dialogs.
- Do not add dependencies.
- Preserve the existing `SiteGuideDropdown` install instructions; this feature adds discoverability, not a replacement.

### Task 1: Pure PWA Install State Utilities

**Files:**
- Create: `frontend/src/app/pwa-install-state.ts`
- Create: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Write the failing utility tests**

Create `frontend/tests/pwa-install-prompt.test.mjs` with this content:

```js
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
```

- [ ] **Step 2: Run the failing utility tests**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `frontend/src/app/pwa-install-state.ts` does not exist.

- [ ] **Step 3: Implement the utility module**

Create `frontend/src/app/pwa-install-state.ts` with this content:

```ts
export const PWA_INSTALL_DISMISS_STORAGE_KEY = "linewatch-pwa-install-dismissed-at-v1";
export const PWA_INSTALL_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_ENGAGEMENT_DELAY_MS = 25_000;

export type PwaInstallPlatform = "android-chromium" | "ios" | "unsupported";

export type PwaInstallPromptInput = {
  activeView: string;
  blockedByOverlay: boolean;
  dismissedAt: number | null;
  engagementSignal: number;
  isMobile: boolean;
  isStandalone: boolean;
  nativePromptAvailable: boolean;
  now: number;
  platform: PwaInstallPlatform;
  timedEngagement: boolean;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type MediaQueryLike = {
  matches: boolean;
};

type StandaloneWindowLike = {
  matchMedia?: (query: string) => MediaQueryLike;
  navigator?: {
    standalone?: boolean;
  };
};

const standaloneDisplayQueries = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
  "(display-mode: window-controls-overlay)",
];

export function detectPwaInstallPlatform(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): PwaInstallPlatform {
  const normalizedUa = userAgent.toLowerCase();
  const normalizedPlatform = platform.toLowerCase();
  const isiPhoneOrIPad =
    normalizedUa.includes("iphone") ||
    normalizedUa.includes("ipad") ||
    normalizedUa.includes("ipod") ||
    (normalizedPlatform === "macintel" && maxTouchPoints > 1);

  if (isiPhoneOrIPad) {
    return "ios";
  }

  const isAndroid = normalizedUa.includes("android");
  const isChromium =
    normalizedUa.includes("chrome/") ||
    normalizedUa.includes("crios/") ||
    normalizedUa.includes("edg/") ||
    normalizedUa.includes("samsungbrowser/");
  const isFirefox = normalizedUa.includes("firefox/");

  if (isAndroid && isChromium && !isFirefox) {
    return "android-chromium";
  }

  return "unsupported";
}

export function isStandalonePwaDisplay(windowLike: StandaloneWindowLike): boolean {
  const mediaStandalone = standaloneDisplayQueries.some((query) => {
    try {
      return windowLike.matchMedia?.(query).matches === true;
    } catch {
      return false;
    }
  });

  return mediaStandalone || windowLike.navigator?.standalone === true;
}

export function readPwaInstallDismissedAt(storage: StorageLike): number | null {
  try {
    const rawValue = storage.getItem(PWA_INSTALL_DISMISS_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writePwaInstallDismissedAt(storage: StorageLike, dismissedAt: number) {
  try {
    storage.setItem(PWA_INSTALL_DISMISS_STORAGE_KEY, String(dismissedAt));
  } catch {
    return;
  }
}

export function clearPwaInstallDismissal(storage: StorageLike) {
  try {
    storage.removeItem(PWA_INSTALL_DISMISS_STORAGE_KEY);
  } catch {
    return;
  }
}

export function canOfferPwaInstall({
  platform,
  nativePromptAvailable,
}: {
  platform: PwaInstallPlatform;
  nativePromptAvailable: boolean;
}): boolean {
  if (platform === "ios") return true;
  if (platform === "android-chromium") return nativePromptAvailable;
  return false;
}

export function isPwaInstallDismissalFresh({
  dismissedAt,
  now,
  cooldownMs = PWA_INSTALL_DISMISS_COOLDOWN_MS,
}: {
  dismissedAt: number | null;
  now: number;
  cooldownMs?: number;
}): boolean {
  return dismissedAt !== null && now - dismissedAt < cooldownMs;
}

export function shouldShowPwaInstallNudge(input: PwaInstallPromptInput): boolean {
  if (!input.isMobile) return false;
  if (input.isStandalone) return false;
  if (input.activeView !== "map") return false;
  if (input.blockedByOverlay) return false;
  if (!canOfferPwaInstall({
    platform: input.platform,
    nativePromptAvailable: input.nativePromptAvailable,
  })) {
    return false;
  }
  if (isPwaInstallDismissalFresh({
    dismissedAt: input.dismissedAt,
    now: input.now,
  })) {
    return false;
  }

  return input.engagementSignal > 0 || input.timedEngagement;
}
```

- [ ] **Step 4: Run the utility tests**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS for the `PWA install prompt state` tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pwa-install-state.ts frontend/tests/pwa-install-prompt.test.mjs
git commit -m "test: add pwa install prompt state coverage"
```

### Task 2: Client Hook for Install Prompt State

**Files:**
- Create: `frontend/src/hooks/usePwaInstallPrompt.ts`
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Add failing hook source tests**

Append this block to `frontend/tests/pwa-install-prompt.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the failing hook source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `frontend/src/hooks/usePwaInstallPrompt.ts` does not exist.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/usePwaInstallPrompt.ts` with this content:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PWA_INSTALL_ENGAGEMENT_DELAY_MS,
  PWA_INSTALL_DISMISS_STORAGE_KEY,
  canOfferPwaInstall,
  clearPwaInstallDismissal,
  detectPwaInstallPlatform,
  isStandalonePwaDisplay,
  readPwaInstallDismissedAt,
  shouldShowPwaInstallNudge,
  writePwaInstallDismissedAt,
  type PwaInstallPlatform,
} from "../app/pwa-install-state";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type UsePwaInstallPromptInput = {
  activeView: string;
  blockedByOverlay: boolean;
  engagementSignal: number;
  isMobile: boolean;
};

type UsePwaInstallPromptResult = {
  canOfferInstall: boolean;
  dismissInstallPrompt: () => void;
  hasNativePrompt: boolean;
  installing: boolean;
  isStandalone: boolean;
  platform: PwaInstallPlatform;
  requestInstall: () => Promise<void>;
  shouldShowNudge: boolean;
};

const displayModeQueries = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
  "(display-mode: window-controls-overlay)",
];

export function usePwaInstallPrompt({
  activeView,
  blockedByOverlay,
  engagementSignal,
  isMobile,
}: UsePwaInstallPromptInput): UsePwaInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [platform, setPlatform] = useState<PwaInstallPlatform>("unsupported");
  const [timedEngagement, setTimedEngagement] = useState(false);

  useEffect(() => {
    setNow(Date.now());
  }, [activeView, blockedByOverlay, engagementSignal, isMobile, deferredPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPlatform = () => {
      setPlatform(
        detectPwaInstallPlatform(
          window.navigator.userAgent,
          window.navigator.platform,
          window.navigator.maxTouchPoints,
        ),
      );
    };
    const syncStandalone = () => {
      setIsStandalone(isStandalonePwaDisplay(window));
    };

    syncPlatform();
    syncStandalone();
    setDismissedAt(readPwaInstallDismissedAt(window.localStorage));

    const mediaQueries = displayModeQueries.map((query) => window.matchMedia(query));
    mediaQueries.forEach((mediaQuery) => {
      if ("addEventListener" in mediaQuery) {
        mediaQuery.addEventListener("change", syncStandalone);
      } else {
        mediaQuery.addListener(syncStandalone);
      }
    });

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        if ("removeEventListener" in mediaQuery) {
          mediaQuery.removeEventListener("change", syncStandalone);
        } else {
          mediaQuery.removeListener(syncStandalone);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!isMobile || isStandalone) {
      setTimedEngagement(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setTimedEngagement(true);
    }, PWA_INSTALL_ENGAGEMENT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isMobile, isStandalone]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      clearPwaInstallDismissal(window.localStorage);
      setDismissedAt(null);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      clearPwaInstallDismissal(window.localStorage);
      setDismissedAt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismissInstallPrompt = useCallback(() => {
    const dismissed = Date.now();
    setDismissedAt(dismissed);
    setNow(dismissed);

    if (typeof window !== "undefined") {
      writePwaInstallDismissedAt(window.localStorage, dismissed);
    }
  }, []);

  const requestInstall = useCallback(async () => {
    if (platform === "ios") {
      dismissInstallPrompt();
      return;
    }

    if (!deferredPrompt || installing) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === "dismissed") {
        dismissInstallPrompt();
      }
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, dismissInstallPrompt, installing, platform]);

  const nativePromptAvailable = Boolean(deferredPrompt);
  const canOfferInstall = canOfferPwaInstall({
    platform,
    nativePromptAvailable,
  });

  const shouldShowNudge = useMemo(
    () =>
      shouldShowPwaInstallNudge({
        activeView,
        blockedByOverlay,
        dismissedAt,
        engagementSignal,
        isMobile,
        isStandalone,
        nativePromptAvailable,
        now,
        platform,
        timedEngagement,
      }),
    [
      activeView,
      blockedByOverlay,
      dismissedAt,
      engagementSignal,
      isMobile,
      isStandalone,
      nativePromptAvailable,
      now,
      platform,
      timedEngagement,
    ],
  );

  return {
    canOfferInstall,
    dismissInstallPrompt,
    hasNativePrompt: nativePromptAvailable,
    installing,
    isStandalone,
    platform,
    requestInstall,
    shouldShowNudge,
  };
}

export { PWA_INSTALL_DISMISS_STORAGE_KEY };
```

- [ ] **Step 4: Run the hook source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePwaInstallPrompt.ts frontend/tests/pwa-install-prompt.test.mjs
git commit -m "feat: add pwa install prompt hook"
```

### Task 3: Mobile Install Nudge Component

**Files:**
- Create: `frontend/src/components/PwaInstallNudge.tsx`
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Add failing component source tests**

Append this block to `frontend/tests/pwa-install-prompt.test.mjs`:

```js
describe("PWA install nudge component", () => {
  it("renders Android native install copy and iOS manual Home Screen instructions", () => {
    const nudgeSource = readFileSync(nudgeSourceUrl, "utf8");

    assert.match(nudgeSource, /export function PwaInstallNudge/);
    assert.match(nudgeSource, /aria-label="Install LineWatchTO"/);
    assert.match(nudgeSource, /Add LineWatchTO to your home screen/);
    assert.match(nudgeSource, /Opens full-screen for quicker commute checks/);
    assert.match(nudgeSource, /Install/);
    assert.match(nudgeSource, /Got it/);
    assert.match(nudgeSource, /Tap Share/);
    assert.match(nudgeSource, /Add to Home Screen/);
    assert.match(nudgeSource, /\/assets\/linewatch\/guide-icons\/share-iphone\.svg/);
    assert.match(nudgeSource, /\/assets\/linewatch\/guide-icons\/add-to-homescreen-android\.svg/);
    assert.match(nudgeSource, /aria-label="Dismiss install prompt"/);
  });
});
```

- [ ] **Step 2: Run the failing component source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `frontend/src/components/PwaInstallNudge.tsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/PwaInstallNudge.tsx` with this content:

```tsx
"use client";

import Image from "next/image";
import { Download, Smartphone, SquarePlus, X } from "lucide-react";
import type { PwaInstallPlatform } from "../app/pwa-install-state";

type PwaInstallNudgeProps = {
  installing: boolean;
  onDismiss: () => void;
  onRequestInstall: () => void;
  platform: PwaInstallPlatform;
};

function InstallGuideIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={14}
      height={14}
      className="pwa-install-nudge-step-asset"
    />
  );
}

export function PwaInstallNudge({
  installing,
  onDismiss,
  onRequestInstall,
  platform,
}: PwaInstallNudgeProps) {
  const isIos = platform === "ios";

  return (
    <aside className="pwa-install-nudge" aria-label="Install LineWatchTO" role="region">
      <div className="pwa-install-nudge-icon" aria-hidden="true">
        <Smartphone size={18} />
      </div>

      <div className="pwa-install-nudge-copy">
        <strong>Add LineWatchTO to your home screen</strong>
        <span>Opens full-screen for quicker commute checks.</span>
        {isIos ? (
          <ol className="pwa-install-nudge-steps" aria-label="iPhone install steps">
            <li>
              <InstallGuideIcon src="/assets/linewatch/guide-icons/share-iphone.svg" />
              <span>Tap Share</span>
            </li>
            <li>
              <SquarePlus size={14} aria-hidden="true" />
              <span>Add to Home Screen</span>
            </li>
          </ol>
        ) : null}
      </div>

      <div className="pwa-install-nudge-actions">
        <button
          type="button"
          className="pwa-install-nudge-primary"
          disabled={installing}
          onClick={isIos ? onDismiss : onRequestInstall}
        >
          {isIos ? (
            "Got it"
          ) : (
            <>
              <Download size={14} aria-hidden="true" />
              {installing ? "Opening" : "Install"}
            </>
          )}
        </button>
        <button
          type="button"
          className="pwa-install-nudge-dismiss"
          aria-label="Dismiss install prompt"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run the component source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PwaInstallNudge.tsx frontend/tests/pwa-install-prompt.test.mjs
git commit -m "feat: add mobile pwa install nudge"
```

### Task 4: More Sheet Install Entry

**Files:**
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Add failing More sheet source tests**

Append this block to `frontend/tests/pwa-install-prompt.test.mjs`:

```js
describe("PWA install entry in More sheet", () => {
  it("keeps a persistent install action available in mobile More options", () => {
    const moreSheetSource = readFileSync(moreSheetSourceUrl, "utf8");

    assert.match(moreSheetSource, /PwaInstallPlatform/);
    assert.match(moreSheetSource, /canOfferPwaInstall/);
    assert.match(moreSheetSource, /onRequestPwaInstall/);
    assert.match(moreSheetSource, /Install LineWatchTO/);
    assert.match(moreSheetSource, /Home screen app/);
    assert.match(moreSheetSource, /Share, then Add to Home Screen/);
    assert.match(moreSheetSource, /mobile-more-install-help/);
  });
});
```

- [ ] **Step 2: Run the failing More sheet test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `MobileMoreSheet.tsx` does not expose the new install props or copy.

- [ ] **Step 3: Modify imports and props in `MobileMoreSheet.tsx`**

Replace the first import line with:

```tsx
import { BarChart3, Bell, Download, FileText, LogIn, LogOut, MessageSquareText, RefreshCcw, Contrast, Pause, UserPlus, UserRound, X, History } from "lucide-react";
```

Add this import after the existing `DashboardData` import:

```tsx
import type { PwaInstallPlatform } from "../app/pwa-install-state";
```

Add these fields to `type Props`:

```tsx
  canOfferPwaInstall: boolean;
  onDismissPwaInstall: () => void;
  onRequestPwaInstall: () => void;
  pwaInstallBusy: boolean;
  pwaInstallPlatform: PwaInstallPlatform;
```

Add these fields to the `MobileMoreSheet` destructuring:

```tsx
  canOfferPwaInstall,
  onDismissPwaInstall,
  onRequestPwaInstall,
  pwaInstallBusy,
  pwaInstallPlatform,
```

- [ ] **Step 4: Add the install section after the Account section**

In `MobileMoreSheet.tsx`, insert this block immediately after the closing `</div>` of the Account section and before the Notifications section:

```tsx
        {canOfferPwaInstall ? (
          <div className="mobile-more-section mobile-more-install-section">
            <h3>Home screen app</h3>
            <button
              type="button"
              className="mobile-more-row mobile-more-install-row"
              disabled={pwaInstallBusy}
              onClick={pwaInstallPlatform === "ios" ? onDismissPwaInstall : onRequestPwaInstall}
            >
              <Download size={18} className="text-slate-500 dark:text-slate-400" />
              <span className="mobile-more-install-copy">
                <span>Install LineWatchTO</span>
                <span>
                  {pwaInstallPlatform === "ios"
                    ? "Share, then Add to Home Screen."
                    : "Open as a full-screen app."}
                </span>
              </span>
            </button>
            {pwaInstallPlatform === "ios" ? (
              <div className="mobile-more-install-help" role="note">
                <span>iPhone Safari</span>
                <strong>Tap Share, then Add to Home Screen.</strong>
              </div>
            ) : null}
          </div>
        ) : null}
```

- [ ] **Step 5: Run the More sheet source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS for the More sheet source tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MobileMoreSheet.tsx frontend/tests/pwa-install-prompt.test.mjs
git commit -m "feat: expose pwa install action in mobile more sheet"
```

### Task 5: Wire the Hook and Nudge Into the Shell

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Add failing shell source tests**

Append this block to `frontend/tests/pwa-install-prompt.test.mjs`:

```js
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
    assert.match(shellSource, /onRequestPwaInstall=\{pwaInstallPrompt\.requestInstall\}/);
  });
});
```

- [ ] **Step 2: Run the failing shell source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `LineWatchShell.tsx` is not wired to the new hook or component.

- [ ] **Step 3: Add imports to `LineWatchShell.tsx`**

Add this import after the `MobileStatusPeek` import:

```tsx
import { PwaInstallNudge } from "./PwaInstallNudge";
```

Add this import after the existing hook imports:

```tsx
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";
```

- [ ] **Step 4: Add engagement state**

After this existing state:

```tsx
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");
```

Insert:

```tsx
  const [pwaEngagementSignal, setPwaEngagementSignal] = useState(0);

  const recordPwaInstallEngagement = useCallback(() => {
    if (!isMobile) return;
    setPwaEngagementSignal((current) => current + 1);
  }, [isMobile]);
```

- [ ] **Step 5: Record engagement from mobile actions**

In `handleMapSelectImpact`, inside `if (isMobile) {` and before `setMobileInspectorDetent("map-focus");`, insert:

```tsx
      recordPwaInstallEngagement();
```

Add `recordPwaInstallEngagement` to the dependency array for `handleMapSelectImpact`.

In `handleSelectStationId`, inside `if (id) {` and before `if (isMobile) {`, insert:

```tsx
      recordPwaInstallEngagement();
```

Add `recordPwaInstallEngagement` to the dependency array for `handleSelectStationId`.

In `onMobileNavSelect`, after `setMapPresentationMode("standard");`, insert:

```tsx
    recordPwaInstallEngagement();
```

Add `recordPwaInstallEngagement` to the dependency array for `onMobileNavSelect`.

- [ ] **Step 6: Invoke the hook after mobile overlay booleans are defined**

After this existing line:

```tsx
  const mobileInspectorOpen = mobileImpactInspectorOpen || mobileStationInspectorOpen;
```

Insert:

```tsx
  const pwaInstallPrompt = usePwaInstallPrompt({
    activeView,
    blockedByOverlay:
      showClosedScreen ||
      rotatedMapMode ||
      mobileInspectorOpen ||
      Boolean(selectedStationId) ||
      Boolean(accountDialogMode) ||
      Boolean(commutePathPreview),
    engagementSignal: pwaEngagementSignal,
    isMobile,
  });

  const showPwaInstallNudge =
    !showClosedScreen &&
    !rotatedMapMode &&
    pwaInstallPrompt.shouldShowNudge;
```

- [ ] **Step 7: Pass install props to both `MobileMoreSheet` render paths**

There are two `MobileMoreSheet` usages in `LineWatchShell.tsx`. Add these props to both:

```tsx
            canOfferPwaInstall={pwaInstallPrompt.canOfferInstall}
            onDismissPwaInstall={pwaInstallPrompt.dismissInstallPrompt}
            onRequestPwaInstall={pwaInstallPrompt.requestInstall}
            pwaInstallBusy={pwaInstallPrompt.installing}
            pwaInstallPlatform={pwaInstallPrompt.platform}
```

- [ ] **Step 8: Render the nudge and suppress the status peek while it is visible**

Insert this block immediately before the existing `MobileStatusPeek` conditional:

```tsx
      {showPwaInstallNudge ? (
        <PwaInstallNudge
          installing={pwaInstallPrompt.installing}
          onDismiss={pwaInstallPrompt.dismissInstallPrompt}
          onRequestInstall={pwaInstallPrompt.requestInstall}
          platform={pwaInstallPrompt.platform}
        />
      ) : null}
```

Change the `MobileStatusPeek` conditional from:

```tsx
      {!showClosedScreen && !rotatedMapMode && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
```

to:

```tsx
      {!showClosedScreen && !rotatedMapMode && !showPwaInstallNudge && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
```

- [ ] **Step 9: Run the shell source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS for shell wiring tests.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/pwa-install-prompt.test.mjs
git commit -m "feat: wire mobile pwa install prompt into shell"
```

### Task 6: Scoped Styles

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Add failing CSS source tests**

Append this block to `frontend/tests/pwa-install-prompt.test.mjs`:

```js
describe("PWA install prompt styles", () => {
  it("adds scoped mobile styles without changing the core PWA manifest or guide styles", () => {
    const globalCss = readFileSync(globalCssUrl, "utf8");

    assert.match(globalCss, /\.pwa-install-nudge/);
    assert.match(globalCss, /bottom:\s*calc\(var\(--mobile-bottom-nav-height\)/);
    assert.match(globalCss, /\.pwa-install-nudge-primary/);
    assert.match(globalCss, /\.pwa-install-nudge-dismiss/);
    assert.match(globalCss, /\.mobile-more-install-row/);
    assert.match(globalCss, /\.mobile-more-install-help/);
    assert.match(globalCss, /\.motion-paused \.pwa-install-nudge/);
    assert.match(globalCss, /\.high-contrast \.pwa-install-nudge/);
  });
});
```

- [ ] **Step 2: Run the failing CSS test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because the CSS selectors do not exist.

- [ ] **Step 3: Add the scoped CSS**

In `frontend/src/app/globals.css`, insert this block immediately before `.mobile-status-peek {`:

```css
.pwa-install-nudge {
  display: none;
}

@media (max-width: 767px) {
  .pwa-install-nudge {
    align-items: center;
    animation: floating-mobile-sheet-enter 180ms cubic-bezier(0.22, 1, 0.36, 1);
    background: rgba(10, 12, 16, 0.96);
    border: 1px solid rgba(250, 204, 21, 0.34);
    border-radius: 8px;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-bottom-nav-margin-bottom) + var(--mobile-safe-bottom) + 10px);
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.38);
    color: #ffffff;
    display: grid;
    gap: 10px;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    left: 16px;
    padding: 10px;
    position: fixed;
    right: 16px;
    z-index: 43;
  }

  .pwa-install-nudge-icon {
    align-items: center;
    background: rgba(250, 204, 21, 0.14);
    border: 1px solid rgba(250, 204, 21, 0.28);
    border-radius: 8px;
    color: #facc15;
    display: inline-flex;
    height: 34px;
    justify-content: center;
    width: 34px;
  }

  .pwa-install-nudge-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .pwa-install-nudge-copy strong {
    color: #ffffff;
    font-size: 13px;
    font-weight: 950;
    line-height: 1.15;
  }

  .pwa-install-nudge-copy > span {
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.25;
  }

  .pwa-install-nudge-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 5px 0 0;
    padding: 0;
  }

  .pwa-install-nudge-steps li {
    align-items: center;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: #e2e8f0;
    display: inline-flex;
    font-size: 10px;
    font-weight: 900;
    gap: 5px;
    min-height: 24px;
    padding: 4px 8px;
  }

  .pwa-install-nudge-step-asset {
    display: block;
    height: 14px;
    object-fit: contain;
    width: 14px;
  }

  .pwa-install-nudge-actions {
    align-items: center;
    display: flex;
    gap: 6px;
  }

  .pwa-install-nudge-primary {
    align-items: center;
    background: #facc15;
    border-radius: 8px;
    color: #111827;
    display: inline-flex;
    font-size: 11px;
    font-weight: 950;
    gap: 5px;
    min-height: 36px;
    padding: 8px 10px;
    white-space: nowrap;
  }

  .pwa-install-nudge-primary:disabled {
    cursor: wait;
    opacity: 0.76;
  }

  .pwa-install-nudge-dismiss {
    align-items: center;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #cbd5e1;
    display: inline-flex;
    height: 36px;
    justify-content: center;
    width: 36px;
  }

  .pwa-install-nudge-primary:focus-visible,
  .pwa-install-nudge-dismiss:focus-visible {
    outline: 3px solid rgba(147, 197, 253, 0.75);
    outline-offset: 2px;
  }

  .motion-paused .pwa-install-nudge {
    animation: none;
  }

  .high-contrast .pwa-install-nudge {
    background: #000000;
    border-color: #facc15;
    border-width: 2px;
    color: #ffffff;
  }
}
```

In `frontend/src/app/globals.css`, insert this block inside the existing `@media (max-width: 767px)` section for `.mobile-more-row`, immediately after the `.dark .mobile-more-row:hover, .dark .mobile-more-row:active` rule:

```css
  .mobile-more-install-row {
    background: rgba(250, 204, 21, 0.09);
    border: 1px solid rgba(250, 204, 21, 0.22);
  }

  .mobile-more-install-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .mobile-more-install-copy span:first-child {
    color: var(--text);
    font-weight: 850;
  }

  .mobile-more-install-copy span:last-child {
    color: var(--quiet);
    font-size: 11px;
    font-weight: 650;
    line-height: 1.25;
  }

  .mobile-more-install-help {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 10px;
  }

  .mobile-more-install-help span {
    color: var(--quiet);
    font-size: 10px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .mobile-more-install-help strong {
    color: var(--text);
    font-size: 12px;
    font-weight: 850;
    line-height: 1.25;
  }
```

- [ ] **Step 4: Run the CSS source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/globals.css frontend/tests/pwa-install-prompt.test.mjs
git commit -m "style: add mobile pwa install prompt styling"
```

### Task 7: Typecheck, Lint, and Fixture Verification

**Files:**
- Verify only; no planned file changes.

- [ ] **Step 1: Run fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Fix verification failures if any command fails**

If a command fails, fix only the files touched by this plan. Re-run the failed command until it passes, then re-run all three commands in this task.

- [ ] **Step 5: Commit verification fixes if needed**

If fixes were required, run:

```bash
git add frontend/src/app/pwa-install-state.ts frontend/src/hooks/usePwaInstallPrompt.ts frontend/src/components/PwaInstallNudge.tsx frontend/src/components/MobileMoreSheet.tsx frontend/src/components/LineWatchShell.tsx frontend/src/app/globals.css frontend/tests/pwa-install-prompt.test.mjs
git commit -m "fix: stabilize pwa install prompt checks"
```

If no fixes were required, do not create an empty commit.

### Task 8: Manual Mobile QA

**Files:**
- Verify only; no planned file changes.

- [ ] **Step 1: Start the frontend**

Run:

```bash
npm --prefix frontend run dev
```

Expected: Next.js dev server starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 2: Android Chromium QA**

On Android Chrome against an HTTPS origin, verify:

- The prompt does not appear immediately on first load.
- The prompt appears after tapping a map impact or after waiting 25 seconds on the map.
- Tapping `Install` opens the browser install dialog.
- Dismissing the custom nudge hides it and stores the 14-day cooldown.
- The nudge does not show in the installed standalone PWA.
- The More sheet shows `Install LineWatchTO` while in the mobile browser and hides it in standalone mode.

- [ ] **Step 3: iOS Safari QA**

On iPhone Safari against an HTTPS origin, verify:

- The prompt does not appear immediately on first load.
- The prompt appears after engagement and shows `Tap Share` and `Add to Home Screen`.
- Tapping `Got it` hides the prompt and stores the 14-day cooldown.
- After adding LineWatchTO to the Home Screen and opening from the icon, the prompt and More-sheet install row do not show.

- [ ] **Step 4: Layout QA**

Verify these mobile states:

- The install nudge replaces `MobileStatusPeek`; both are not visible at the same time.
- The install nudge is not visible over station detail, active alert inspector, commute path preview, account dialogs, rotated map mode, or the closed subway screen.
- Text fits at 320px CSS width.
- High contrast mode keeps visible focus outlines and readable copy.
- Reduced motion mode removes the nudge entry animation.

- [ ] **Step 5: Stop the dev server**

Stop the running `npm --prefix frontend run dev` process with `Ctrl+C`.

## Self-Review

- Spec coverage: The plan covers mobile-only prompting, standalone detection, Android native prompt, iOS instructions, first-load restraint, engagement gating, cooldown, permanent More-sheet access, styling, and verification.
- Placeholder scan: No task contains deferred placeholder markers or incomplete implementation instructions.
- Type consistency: `PwaInstallPlatform`, `canOfferPwaInstall`, `shouldShowPwaInstallNudge`, `usePwaInstallPrompt`, and `PwaInstallNudge` names are consistent across tasks.
- Scope check: This is frontend-only. It does not change push notification behavior, service-worker caching, backend APIs, or README claims.

## User-Visible Result

After implementation, mobile browser users will see a compact install prompt only after LineWatchTO has had a chance to prove useful. Android Chrome users can tap `Install` to open the native browser install flow. iPhone users see direct Add to Home Screen steps because iOS requires manual installation through the Share menu. Installed PWA users should not see install prompts.
