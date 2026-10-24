"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

  if (!latestReleaseKey || latestReleaseKey === dismissedReleaseKey) {
    return null;
  }

  return (
    <aside className="app-update-banner" role="status" aria-live="polite" aria-busy={isUpdating}>
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
