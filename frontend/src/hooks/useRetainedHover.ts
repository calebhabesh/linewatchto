"use client";

import { useEffect, useState } from "react";

// Keep the label and its raster cutout until the CSS exit transition finishes.
export function useRetainedHover<T>(value: T | null) {
  const [retained, setRetained] = useState(value);
  if (value !== null && value !== retained) setRetained(value);

  useEffect(() => {
    if (value !== null) return;
    const timer = window.setTimeout(() => setRetained(null), 140);
    return () => window.clearTimeout(timer);
  }, [value]);

  return value ?? retained;
}
