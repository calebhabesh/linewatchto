"use client";

import { useEffect, useState } from "react";

export function usePageVisibility() {
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const synchronizeVisibility = () => {
      setPageVisible(document.visibilityState === "visible");
    };
    const handlePageHide = () => setPageVisible(false);

    synchronizeVisibility();
    document.addEventListener("visibilitychange", synchronizeVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", synchronizeVisibility);

    return () => {
      document.removeEventListener("visibilitychange", synchronizeVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", synchronizeVisibility);
    };
  }, []);

  return pageVisible;
}
