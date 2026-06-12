"use client";

import { useEffect } from "react";

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const explicitDevServiceWorker = process.env.NEXT_PUBLIC_LINEWATCH_ENABLE_SW === "true";
    if (process.env.NODE_ENV !== "production" && !explicitDevServiceWorker) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
