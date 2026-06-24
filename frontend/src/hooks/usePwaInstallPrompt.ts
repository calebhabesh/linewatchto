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

// Storage key: linewatch-pwa-install-dismissed-at-v1
export { PWA_INSTALL_DISMISS_STORAGE_KEY };

