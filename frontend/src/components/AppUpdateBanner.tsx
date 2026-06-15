"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { lineWatchBuildLabel } from "../app/app-build";
import { reloadLineWatchAppForUpdate } from "../app/local-app-reset";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DISMISSED_UPDATE_BUILD_STORAGE_KEY = "linewatch-dismissed-update-build";

type VersionPayload = {
  appVersion?: string;
  buildLabel?: string;
  versionLabel?: string;
};

function updateCheckUrl() {
  const url = new URL("/version.json", window.location.origin);
  url.searchParams.set("t", String(Date.now()));
  return url.href;
}

export function AppUpdateBanner() {
  const [latestVersion, setLatestVersion] = useState<VersionPayload | null>(null);
  const [dismissedBuildLabel, setDismissedBuildLabel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(DISMISSED_UPDATE_BUILD_STORAGE_KEY);
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

      const body = await response.json() as VersionPayload;
      if (body.buildLabel && body.buildLabel !== lineWatchBuildLabel) {
        setLatestVersion(body);
        return;
      }

      setLatestVersion(null);
      setDismissedBuildLabel(null);
      try {
        window.sessionStorage.removeItem(DISMISSED_UPDATE_BUILD_STORAGE_KEY);
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
    const buildLabel = latestVersion?.buildLabel || null;
    setDismissedBuildLabel(buildLabel);
    try {
      if (buildLabel) {
        window.sessionStorage.setItem(DISMISSED_UPDATE_BUILD_STORAGE_KEY, buildLabel);
      }
    } catch {
      // Dismissal is a convenience; storage failures should not block the UI.
    }
  }, [latestVersion?.buildLabel]);

  if (!latestVersion?.buildLabel || latestVersion.buildLabel === dismissedBuildLabel) {
    return null;
  }

  return (
    <aside className="app-update-banner" role="status" aria-live="polite" aria-busy={isUpdating}>
      <div className="app-update-banner-copy">
        <strong>New version available</strong>
        <span>Update LineWatch TO to get the latest fixes and improvements.</span>
      </div>
      <div className="app-update-banner-actions">
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
