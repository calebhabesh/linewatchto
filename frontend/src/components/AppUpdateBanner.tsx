"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { lineWatchAppVersion, lineWatchBuildLabel } from "../app/app-build";
import {
  appUpdateReleaseNote,
  appUpdateNewVersion,
  appUpdateReleaseKey,
  isQuietUpdateMoment,
  shouldApplyBackgroundUpdate,
  shouldShowAppUpdate,
  type AppUpdateVersion,
} from "../app/app-update-version";
import { reloadLineWatchAppForUpdate, reloadLineWatchAppInBackground } from "../app/local-app-reset";
import { placeUpdateBanner, UPDATE_BANNER_SHEET_GAP } from "../app/app-update-banner-placement";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DISMISSED_UPDATE_RELEASE_STORAGE_KEY = "linewatch-dismissed-update-release";
const BACKGROUND_UPDATE_TARGET_STORAGE_KEY = "linewatch-background-update-target";

const installedVersion = {
  appVersion: lineWatchAppVersion,
  buildLabel: lineWatchBuildLabel,
};

function releaseNotesUpdateUrl() {
  const url = new URL("/app-update.html", window.location.origin);
  url.searchParams.set("auto", "1");
  url.searchParams.set("source", "release-notes");
  url.searchParams.set("return", "/?panel=release-notes");
  return url.href;
}

function updateCheckUrl() {
  const url = new URL("/version.json", window.location.origin);
  url.searchParams.set("t", String(Date.now()));
  return url.href;
}

const MOBILE_SHEET_QUERY = "(max-width: 767px)";
/** Frames without movement before the banner stops following the sheet. */
const SETTLED_FRAMES = 8;

function shown(element: Element | null): element is HTMLElement {
  if (!element) return false;
  const visible = (element as HTMLElement).checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
  return visible !== false && element.getBoundingClientRect().height > 0;
}

/**
 * On phones, keeps the banner just above the pull-up service sheet
 * (app/app-update-banner-placement.ts). It follows the sheet while it is
 * dragged, snaps or resizes, then stops; with no sheet on screen (another
 * view, the map inspector, the rotated map, desktop) the banner keeps its
 * place at the bottom.
 */
function useAboveMobileServiceSheet(bannerRef: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!active || !banner) return;
    const media = window.matchMedia(MOBILE_SHEET_QUERY);
    let sheet: HTMLElement | null = null;
    let frame: number | null = null;
    let settled = 0;
    let last = "";
    const sheetObserver = new MutationObserver(() => follow());
    const resizeObserver = new ResizeObserver(() => follow());
    resizeObserver.observe(banner);

    const resetToDefault = () => {
      banner.style.removeProperty("--app-update-banner-top");
      delete banner.dataset.placement;
      return "default";
    };
    const watchSheet = () => {
      const current = document.querySelector<HTMLElement>(".mobile-status-peek");
      if (current === sheet) return;
      if (sheet) resizeObserver.unobserve(sheet);
      sheetObserver.disconnect();
      sheet = current;
      if (!sheet) return;
      // The drag moves it by inline transform; snaps and notices by attribute.
      sheetObserver.observe(sheet, { attributes: true, attributeFilter: ["style", "data-snap", "data-dragging", "data-has-notice"] });
      resizeObserver.observe(sheet);
    };
    const place = () => {
      watchSheet();
      if (!media.matches || !shown(sheet)) return resetToDefault();
      const rect = sheet.getBoundingClientRect();
      if (rect.top >= window.innerHeight - 1) return resetToDefault();
      // A closing-soon notice is drawn just above the sheet; stay above it too.
      const notice = sheet.querySelector(":scope > .current-service");
      const sheetTop = Math.min(rect.top, shown(notice) ? notice.getBoundingClientRect().top : Number.POSITIVE_INFINITY);
      const grid = sheet.querySelector(".mobile-status-peek-grid");
      const topbar = document.querySelector(".mobile-app-topbar");
      // The search bar and shortcuts bound it from above, unless the
      // expanded sheet already covers them.
      const topbarBottom = shown(topbar) ? topbar.getBoundingClientRect().bottom : 0;
      const result = placeUpdateBanner({
        sheetTop,
        gridTop: shown(grid) ? grid.getBoundingClientRect().top : null,
        minTop: topbarBottom < sheetTop ? topbarBottom + UPDATE_BANNER_SHEET_GAP : 0,
        bannerHeight: banner.offsetHeight,
      });
      banner.style.setProperty("--app-update-banner-top", `${result.top}px`);
      banner.dataset.placement = result.placement;
      return `${result.placement}:${result.top}`;
    };
    const tick = () => {
      frame = null;
      const key = place();
      settled = key === last ? settled + 1 : 0;
      last = key;
      if (settled < SETTLED_FRAMES) frame = requestAnimationFrame(tick);
    };
    function follow() {
      settled = 0;
      if (frame === null) frame = requestAnimationFrame(tick);
    }

    last = place();
    follow();
    // The shell's modes (inspector, rotated map, dialogs, views) show and hide the sheet.
    const shellObserver = new MutationObserver(() => follow());
    const shell = document.querySelector(".linewatch-shell");
    if (shell) shellObserver.observe(shell, { attributes: true, attributeFilter: ["class", "data-active-view", "data-network"] });
    // The sheet mounts with the map view; look for it again now and then.
    const recheck = window.setInterval(() => {
      if (document.querySelector(".mobile-status-peek") !== sheet) follow();
    }, 1000);
    media.addEventListener("change", follow);
    window.addEventListener("resize", follow);
    window.visualViewport?.addEventListener("resize", follow);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.clearInterval(recheck);
      sheetObserver.disconnect();
      shellObserver.disconnect();
      resizeObserver.disconnect();
      media.removeEventListener("change", follow);
      window.removeEventListener("resize", follow);
      window.visualViewport?.removeEventListener("resize", follow);
      resetToDefault();
    };
  }, [active, bannerRef]);
}

export function AppUpdateBanner() {
  const [latestVersion, setLatestVersion] = useState<AppUpdateVersion | null>(null);
  const [dismissedReleaseKey, setDismissedReleaseKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(DISMISSED_UPDATE_RELEASE_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const foregroundStartedAtRef = useRef(0);
  const lastInteractionAtRef = useRef(Number.NEGATIVE_INFINITY);

  const maybeApplyBackgroundUpdate = useCallback((latest: AppUpdateVersion) => {
    if (!shouldApplyBackgroundUpdate(latest, installedVersion)) return;
    if (document.visibilityState !== "visible") return;
    if (!isQuietUpdateMoment({
      now: Date.now(),
      foregroundStartedAt: foregroundStartedAtRef.current,
      lastInteractionAt: lastInteractionAtRef.current,
    })) return;

    // Try each deployed build once per session so a stale shell cannot loop reloads.
    const targetBuild = latest.buildLabel?.trim() ?? "";
    try {
      if (window.sessionStorage.getItem(BACKGROUND_UPDATE_TARGET_STORAGE_KEY) === targetBuild) return;
      window.sessionStorage.setItem(BACKGROUND_UPDATE_TARGET_STORAGE_KEY, targetBuild);
    } catch {
      return;
    }
    void reloadLineWatchAppInBackground();
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch(updateCheckUrl(), {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
        },
      });
      if (!response.ok) return;

      const body = await response.json() as AppUpdateVersion;
      if (shouldShowAppUpdate(body, installedVersion)) {
        setLatestVersion(body);
        return;
      }

      setLatestVersion(null);
      setDismissedReleaseKey(null);
      maybeApplyBackgroundUpdate(body);
      try {
        window.sessionStorage.removeItem(DISMISSED_UPDATE_RELEASE_STORAGE_KEY);
      } catch {
        // Update checks are best-effort and should never interrupt the dashboard.
      }
    } catch {
      // Update checks are best-effort and should never interrupt the dashboard.
    }
  }, [maybeApplyBackgroundUpdate]);

  useEffect(() => {
    foregroundStartedAtRef.current = Date.now();
    const initialCheck = window.setTimeout(() => {
      void checkForUpdate();
    }, 0);

    const interval = window.setInterval(() => {
      void checkForUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        foregroundStartedAtRef.current = Date.now();
        void checkForUpdate();
      }
    };
    const handleFocus = () => {
      void checkForUpdate();
    };
    const handleInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };
    const interactionEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    for (const type of interactionEvents) {
      window.addEventListener(type, handleInteraction, { capture: true, passive: true });
    }

    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      for (const type of interactionEvents) {
        window.removeEventListener(type, handleInteraction, { capture: true });
      }
    };
  }, [checkForUpdate]);

  const handleUpdate = useCallback(() => {
    if (isUpdating) return;

    setIsUpdating(true);
    void reloadLineWatchAppForUpdate().catch(() => {
      setIsUpdating(false);
    });
  }, [isUpdating]);

  const handleLater = useCallback(() => {
    const releaseKey = latestVersion ? appUpdateReleaseKey(latestVersion) : null;
    setDismissedReleaseKey(releaseKey);
    try {
      if (releaseKey) {
        window.sessionStorage.setItem(DISMISSED_UPDATE_RELEASE_STORAGE_KEY, releaseKey);
      }
    } catch {
      // Dismissal is a convenience; storage failures should not block the UI.
    }
  }, [latestVersion]);

  const handleViewChanges = useCallback(() => {
    window.location.replace(releaseNotesUpdateUrl());
  }, []);

  const latestReleaseKey = latestVersion ? appUpdateReleaseKey(latestVersion) : null;
  const releaseNote = latestVersion ? appUpdateReleaseNote(latestVersion, installedVersion) : null;
  const updateVersion = latestVersion ? appUpdateNewVersion(latestVersion, installedVersion) : null;

  const bannerShown = Boolean(latestReleaseKey && latestReleaseKey !== dismissedReleaseKey);
  useAboveMobileServiceSheet(bannerRef, bannerShown);

  if (!bannerShown) {
    return null;
  }

  return (
    <aside ref={bannerRef} className="app-update-banner" role="status" aria-live="polite" aria-busy={isUpdating}>
      <div className="app-update-banner-copy">
        <div className="app-update-banner-heading">
          <strong>{releaseNote ? `${releaseNote.title} available` : "New version available"}</strong>
          {updateVersion ? <span className="app-update-banner-version">v{updateVersion}</span> : null}
        </div>
        <span className="app-update-banner-summary">{releaseNote?.summary ?? "Update LineWatchTO to get the latest fixes and improvements."}</span>
      </div>
      <div className="app-update-banner-actions">
        {releaseNote ? (
          <button type="button" className="app-update-banner-view" disabled={isUpdating} onClick={handleViewChanges}>
            View Changes
          </button>
        ) : null}
        <button
          type="button"
          className="app-update-banner-later"
          disabled={isUpdating}
          onClick={handleLater}
        >
          Later
        </button>
        <button type="button" onClick={handleUpdate} disabled={isUpdating}>
          <RefreshCcw size={15} className={isUpdating ? "app-update-banner-spin" : undefined} />
          {isUpdating ? "Updating..." : "Update Now"}
        </button>
      </div>
      {isUpdating && (
        <div className="app-update-banner-progress">
          <div className="app-update-banner-progress-fill" />
        </div>
      )}
    </aside>
  );
}
