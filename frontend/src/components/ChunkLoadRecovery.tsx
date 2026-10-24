"use client";

import { useEffect } from "react";
import { lineWatchBuildLabel } from "../app/app-build";
import { claimChunkRecovery, isChunkLoadFailure, isNextStaticResourceUrl } from "../app/chunk-load-recovery";
import { reloadLineWatchAppInBackground } from "../app/local-app-reset";

export function ChunkLoadRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const recover = () => {
      let storage: Storage | null = null;
      try {
        storage = window.sessionStorage;
      } catch {
        storage = null;
      }
      if (claimChunkRecovery(storage, lineWatchBuildLabel)) {
        void reloadLineWatchAppInBackground();
      }
    };
    // Script and stylesheet load errors do not bubble, so listen during capture.
    const handleResourceError = (event: Event) => {
      const target = event.target;
      const url = target instanceof HTMLScriptElement
        ? target.src
        : target instanceof HTMLLinkElement
          ? target.href
          : null;
      if (isNextStaticResourceUrl(url, window.location.origin)) recover();
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) recover();
    };

    window.addEventListener("error", handleResourceError, true);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleResourceError, true);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
