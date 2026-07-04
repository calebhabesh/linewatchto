export const PWA_INSTALL_DISMISS_STORAGE_KEY = "linewatch-pwa-install-dismissed-at-v1";
export const PWA_INSTALL_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_ENGAGEMENT_DELAY_MS = 25_000;

export type PwaInstallPlatform =
  | "android-chrome"
  | "android-chromium"
  | "android-firefox"
  | "android-other"
  | "ios-safari"
  | "ios-other"
  | "unsupported";

export type PwaInstallPromptInput = {
  activeView: string;
  blockedByOverlay: boolean;
  dismissedAt: number | null;
  engagementSignal: number;
  hasInstalledRelatedPwa: boolean;
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

export type InstalledRelatedApp = {
  platform?: string;
  id?: string;
  url?: string;
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
    const isNonSafariIosBrowser =
      normalizedUa.includes("crios/") ||
      normalizedUa.includes("fxios/") ||
      normalizedUa.includes("edgios/") ||
      normalizedUa.includes("opios/");

    return isNonSafariIosBrowser ? "ios-other" : "ios-safari";
  }

  const isAndroid = normalizedUa.includes("android");
  if (!isAndroid) return "unsupported";

  const isFirefox = normalizedUa.includes("firefox/");
  if (isFirefox) return "android-firefox";

  const isChrome =
    normalizedUa.includes("chrome/") &&
    !normalizedUa.includes("edg/") &&
    !normalizedUa.includes("edga/") &&
    !normalizedUa.includes("opr/") &&
    !normalizedUa.includes("samsungbrowser/");

  if (isChrome) {
    return "android-chrome";
  }

  const isChromium =
    normalizedUa.includes("chrome/") ||
    normalizedUa.includes("edg/") ||
    normalizedUa.includes("edga/") ||
    normalizedUa.includes("opr/") ||
    normalizedUa.includes("samsungbrowser/");

  if (isChromium) {
    return "android-chromium";
  }

  return "android-other";
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
  if (platform === "ios-safari") return true;
  if (platform === "android-chrome" || platform === "android-chromium") return nativePromptAvailable;
  return false;
}

export function canShowPwaInstallHelp({
  hasInstalledRelatedPwa = false,
  isMobile,
  isStandalone,
  platform,
}: {
  hasInstalledRelatedPwa?: boolean;
  isMobile: boolean;
  isStandalone: boolean;
  platform: PwaInstallPlatform;
}): boolean {
  if (!isMobile) return false;
  if (isStandalone) return false;
  if (hasInstalledRelatedPwa) return false;
  return platform !== "unsupported";
}

export function hasInstalledRelatedPwa(relatedApps: InstalledRelatedApp[]): boolean {
  return relatedApps.some((app) => app.platform === "webapp");
}

export function getPwaInstallHeading(platform: PwaInstallPlatform): string {
  switch (platform) {
    case "android-chrome":
      return "Install App for Android on Chrome";
    case "android-chromium":
      return "Install App for Android on Other Browser";
    case "android-firefox":
      return "Install App for Android on Firefox";
    case "android-other":
      return "Install App for Android on Other Browser";
    case "ios-safari":
      return "Install App for iOS on Safari";
    case "ios-other":
      return "Install App for iOS on Other Browser";
    case "unsupported":
    default:
      return "Install App";
  }
}

export function getPwaInstallInstructionText({
  platform,
  nativePromptAvailable,
}: {
  platform: PwaInstallPlatform;
  nativePromptAvailable: boolean;
}): string {
  if (platform === "android-chrome" && nativePromptAvailable) {
    return "Tap Install, then confirm in Chrome.";
  }
  if (platform === "android-chrome") {
    return "Open the three-dot menu, tap Add to Home screen, then confirm.";
  }
  if (platform === "android-chromium") {
    return nativePromptAvailable
      ? "Tap Install, then confirm in your browser."
      : "Open the browser menu, tap Add to Home screen or Install, then confirm.";
  }
  if (platform === "android-firefox" || platform === "android-other") {
    return "Open the browser menu, tap Add to Home screen or Install, then confirm.";
  }
  if (platform === "ios-safari") {
    return "Tap Share, choose Add to Home Screen, then tap Add.";
  }
  if (platform === "ios-other") {
    return "Open this page in Safari, tap Share, then Add to Home Screen.";
  }
  return "Use your browser menu to add LineWatchTO to your home screen.";
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
  if (input.hasInstalledRelatedPwa) return false;
  if (!canShowPwaInstallHelp({
    hasInstalledRelatedPwa: input.hasInstalledRelatedPwa,
    isMobile: input.isMobile,
    isStandalone: input.isStandalone,
    platform: input.platform,
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
