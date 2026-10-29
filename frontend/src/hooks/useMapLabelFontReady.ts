"use client";

import { useEffect, useState } from "react";

const MAP_LABEL_FONT_SPECS = [
  '400 80px "TeX Gyre Heros"',
  '700 100px "TeX Gyre Heros"',
] as const;
const MAP_LABEL_FONT_SAMPLE = "Tobermory Norfinch Oakdale Union";

let mapLabelFontLoaded = false;
let mapLabelFontLoadPromise: Promise<boolean> | null = null;

// document.fonts.check() also answers true while a matching face is still
// loading, so read the registered faces' status when they are available.
function mapLabelFontAlreadyLoaded(): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return false;
  const faces = Array.from(document.fonts).filter((face) => face.family.replace(/["']/g, "") === "TeX Gyre Heros");
  if (faces.length > 0) {
    return ["400", "700"].every((weight) =>
      faces.some((face) => String(face.weight) === weight && face.status === "loaded"),
    );
  }
  return MAP_LABEL_FONT_SPECS.every((spec) => document.fonts.check(spec, MAP_LABEL_FONT_SAMPLE));
}

function loadMapLabelFont(): Promise<boolean> {
  if (mapLabelFontLoaded) return Promise.resolve(true);
  if (mapLabelFontAlreadyLoaded()) {
    mapLabelFontLoaded = true;
    return Promise.resolve(true);
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
    if (mapLabelFontAlreadyLoaded()) {
      mapLabelFontLoaded = true;
      return true;
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
