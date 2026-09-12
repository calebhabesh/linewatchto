"use client";

import { useEffect } from "react";
import { unregisterServiceWorkersWithoutPushSubscriptions } from "../app/push-browser-state";
import { lineWatchBuildLabel } from "../app/app-build";

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const explicitDevServiceWorker = process.env.NEXT_PUBLIC_LINEWATCH_ENABLE_SW === "true";
    const shouldEnable = process.env.NODE_ENV === "production" || explicitDevServiceWorker;
    const requestNotificationCleanup = () => {
      navigator.serviceWorker.ready.then((registration) => {
        const worker = registration.active || navigator.serviceWorker.controller;
        worker?.postMessage({ type: "linewatch-cleanup-notifications" });
        worker?.postMessage({ type: "linewatch-cache-loaded-assets", urls:
          performance.getEntriesByType("resource").map((entry) => entry.name),
        });
      }).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestNotificationCleanup();
      }
    };

    if (!shouldEnable) {
      // Remove inactive dev workers, but keep any registration that owns a push subscription.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => unregisterServiceWorkersWithoutPushSubscriptions(registrations))
        .catch(() => undefined);
      return;
    }

    const register = () => {
      const devFlag = process.env.NODE_ENV !== "production" ? "?env=dev" : `?build=${encodeURIComponent(lineWatchBuildLabel)}`;
      navigator.serviceWorker.register(`/sw.js${devFlag}`, {
        scope: "/",
        updateViaCache: "none",
      }).then(() => {
        requestNotificationCleanup();
      }).catch(() => undefined);
    };

    window.addEventListener("focus", requestNotificationCleanup);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("focus", requestNotificationCleanup);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
