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

export function canShowPwaInstallHelp({
  isMobile,
  isStandalone,
  platform,
}: {
  isMobile: boolean;
  isStandalone: boolean;
  platform: PwaInstallPlatform;
}): boolean {
  if (!isMobile) return false;
  if (isStandalone) return false;
  return platform === "ios" || platform === "android-chromium";
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
