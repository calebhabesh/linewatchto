"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { lineWatchAppVersion, lineWatchBuildLabel } from "../app/app-build";
import {
  appUpdateReleaseKey,
  shouldShowAppUpdate,
  type AppUpdateVersion,
} from "../app/app-update-version";
import { reloadLineWatchAppForUpdate } from "../app/local-app-reset";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DISMISSED_UPDATE_RELEASE_STORAGE_KEY = "linewatch-dismissed-update-release";

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
      try {
        window.sessionStorage.removeItem(DISMISSED_UPDATE_RELEASE_STORAGE_KEY);
      } catch {
        // Update checks are best-effort and should never interrupt the dashboard.
      }
    } catch {
      // Update checks are best-effort and should never interrupt the dashboard.
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      void checkForUpdate();
    }, 0);

    const interval = window.setInterval(() => {
      void checkForUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };
    const handleFocus = () => {
      void checkForUpdate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
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
  const releaseNote = latestVersion?.releaseNote ?? null;

  if (!latestReleaseKey || latestReleaseKey === dismissedReleaseKey) {
    return null;
  }

  return (
    <aside className="app-update-banner" role="status" aria-live="polite" aria-busy={isUpdating}>
      <div className="app-update-banner-copy">
        <strong>{releaseNote ? `${releaseNote.title} available` : "New version available"}</strong>
        <span>{releaseNote?.summary ?? "Update LineWatchTO to get the latest fixes and improvements."}</span>
      </div>
      <div className="app-update-banner-actions">
        {releaseNote ? (
          <button type="button" className="app-update-banner-view" disabled={isUpdating} onClick={handleViewChanges}>
            View changes
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
          {isUpdating ? "Updating..." : "Update now"}
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
