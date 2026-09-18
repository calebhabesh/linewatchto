"use client";

import { useEffect, useState } from "react";

const MAP_LABEL_FONT_SPECS = [
  '400 80px "TeX Gyre Heros"',
  '700 100px "TeX Gyre Heros"',
] as const;
const MAP_LABEL_FONT_SAMPLE = "Tobermory Norfinch Oakdale Union";

let mapLabelFontLoaded = false;
let mapLabelFontLoadPromise: Promise<boolean> | null = null;

export function loadMapLabelFont(): Promise<boolean> {
  if (mapLabelFontLoaded) return Promise.resolve(true);
  if (typeof document !== "undefined" && document.fonts?.check) {
    const isAlreadyLoaded = MAP_LABEL_FONT_SPECS.every((spec) =>
      document.fonts.check(spec, MAP_LABEL_FONT_SAMPLE),
    );
    if (isAlreadyLoaded) {
      mapLabelFontLoaded = true;
      return Promise.resolve(true);
    }
  }
  if (mapLabelFontLoadPromise) return mapLabelFontLoadPromise;
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve(false);

  mapLabelFontLoadPromise = Promise.all(
    MAP_LABEL_FONT_SPECS.map((spec) => document.fonts.load(spec, MAP_LABEL_FONT_SAMPLE)),
  )
    .then((fontFaces) => {
      mapLabelFontLoaded = fontFaces.every(
        (faces) => faces.length > 0 && faces.every((face) => face.status === "loaded"),
      );
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
  const [ready, setReady] = useState(() => {
    if (mapLabelFontLoaded) return true;
    if (typeof document !== "undefined" && document.fonts?.check) {
      const isAlreadyLoaded = MAP_LABEL_FONT_SPECS.every((spec) =>
        document.fonts.check(spec, MAP_LABEL_FONT_SAMPLE),
      );
      if (isAlreadyLoaded) {
        mapLabelFontLoaded = true;
        return true;
      }
    }
    return false;
  });

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
