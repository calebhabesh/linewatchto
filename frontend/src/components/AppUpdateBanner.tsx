"use client";

import { RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lineWatchAppVersionLabel, lineWatchBuildLabel } from "../app/app-build";
import { reloadLineWatchAppForUpdate } from "../app/local-app-reset";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

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
  const [dismissedBuildLabel, setDismissedBuildLabel] = useState<string | null>(null);

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

  const latestLabel = useMemo(() => {
    if (!latestVersion?.buildLabel) return "";
    return latestVersion.versionLabel || `v${latestVersion.appVersion || "unknown"} · ${latestVersion.buildLabel}`;
  }, [latestVersion]);

  if (!latestVersion?.buildLabel || latestVersion.buildLabel === dismissedBuildLabel) {
    return null;
  }

  return (
    <aside className="app-update-banner" role="status" aria-live="polite">
      <div className="app-update-banner-copy">
        <strong>New Version Available</strong>
        <span><strong>Installed:</strong> {lineWatchAppVersionLabel}</span>
        <span><strong>Latest:</strong> {latestLabel}</span>
      </div>
      <div className="app-update-banner-actions">
        <button type="button" onClick={() => { void reloadLineWatchAppForUpdate(); }}>
          <RefreshCcw size={15} />
          Update
        </button>
        <button
          type="button"
          className="app-update-banner-dismiss"
          onClick={() => setDismissedBuildLabel(latestVersion.buildLabel || null)}
          aria-label="Dismiss update notice"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}
