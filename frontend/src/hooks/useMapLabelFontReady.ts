"use client";

import { useEffect, useState } from "react";

const MAP_LABEL_FONT_SPEC = '400 80px "TeX Gyre Heros"';
const MAP_LABEL_FONT_SAMPLE = "Tobermory Norfinch Oakdale Union";

let mapLabelFontLoaded = false;
let mapLabelFontLoadPromise: Promise<boolean> | null = null;

export function loadMapLabelFont(): Promise<boolean> {
  if (mapLabelFontLoaded) return Promise.resolve(true);
  if (mapLabelFontLoadPromise) return mapLabelFontLoadPromise;
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve(false);

  mapLabelFontLoadPromise = document.fonts
    .load(MAP_LABEL_FONT_SPEC, MAP_LABEL_FONT_SAMPLE)
    .then((faces) => {
      mapLabelFontLoaded = faces.length > 0 && faces.every((face) => face.status === "loaded");
      return mapLabelFontLoaded;
    })
    .catch(() => false)
    .finally(() => {
      mapLabelFontLoadPromise = null;
    });

  return mapLabelFontLoadPromise;
}

/**
 * SVG text bounds are font-dependent. Raster label crops must never be
 * measured against the temporary fallback selected by font-display: swap,
 * because those stale bounds can expose pixels from an adjacent map label.
 */
export function useMapLabelFontReady() {
  const [ready, setReady] = useState(mapLabelFontLoaded);

  useEffect(() => {
    let cancelled = false;
    void loadMapLabelFont().then((loaded) => {
      if (!cancelled) setReady(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
