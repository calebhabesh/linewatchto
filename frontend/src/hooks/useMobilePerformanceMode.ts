"use client";

import { useEffect, useState } from "react";

const MOBILE_PERFORMANCE_QUERY = "(max-width: 767px), (pointer: coarse)";

export function useMobilePerformanceMode() {
  const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_PERFORMANCE_QUERY);

    const sync = () => setMobilePerformanceMode(mediaQuery.matches);
    sync();

    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return mobilePerformanceMode;
}
