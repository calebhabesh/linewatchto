"use client";

import { useEffect, useMemo, useState } from "react";

export type RasterMapTheme = "light" | "dark" | "high-contrast";
export type RasterMapDensity = "mobile" | "desktop";

type RasterMapPlaneProps = {
  network: "ttc" | "regional";
  plane: "background" | "foreground";
  theme: RasterMapTheme;
  density: RasterMapDensity;
  className?: string;
  cutoutPolygon?: string | null;
  svgViewBox?: string;
  onReady?: () => void;
};

export function rasterMapSource(
  network: "ttc" | "regional",
  plane: "background" | "foreground",
  theme: RasterMapTheme,
  density: RasterMapDensity,
) {
  return `/assets/linewatch/raster-maps/${network}-${plane}-${theme}-${density}.png`;
}

export function RasterMapPlane({
  network,
  plane,
  theme,
  density,
  className = "",
  cutoutPolygon = null,
  svgViewBox,
  onReady,
}: RasterMapPlaneProps) {
  const desiredSource = useMemo(
    () => rasterMapSource(network, plane, theme, density),
    [density, network, plane, theme],
  );
  const [displayedSource, setDisplayedSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = "sync";
    image.src = desiredSource;

    const revealDecodedImage = () => {
      if (!cancelled) setDisplayedSource(desiredSource);
    };
    image.decode().then(revealDecodedImage, () => {
      if (image.complete && image.naturalWidth > 0) revealDecodedImage();
      else image.addEventListener("load", revealDecodedImage, { once: true });
    });

    return () => {
      cancelled = true;
      image.removeEventListener("load", revealDecodedImage);
    };
  }, [desiredSource]);

  if (!displayedSource) return null;

  if (svgViewBox) {
    const [, , viewBoxWidth = "0", viewBoxHeight = "0"] = svgViewBox.split(/\s+/);
    const maskId = `${network}-${plane}-raster-mask`;
    return (
      <svg
        aria-hidden="true"
        className={`raster-map-plane raster-map-plane--${plane} ${className}`.trim()}
        viewBox={svgViewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={viewBoxWidth} height={viewBoxHeight}>
            <rect width={viewBoxWidth} height={viewBoxHeight} fill="white" />
            {cutoutPolygon ? <polygon points={cutoutPolygon} fill="black" /> : null}
          </mask>
        </defs>
        <image
          href={displayedSource}
          width={viewBoxWidth}
          height={viewBoxHeight}
          preserveAspectRatio="xMidYMid meet"
          mask={`url(#${maskId})`}
          onLoad={onReady}
        />
      </svg>
    );
  }

  return (
    // The authored raster must stay an exact, unoptimized texture. Next/Image's
    // responsive source replacement can swap the bitmap during camera motion.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      aria-hidden="true"
      alt=""
      className={`raster-map-plane raster-map-plane--${plane} ${className}`.trim()}
      decoding="sync"
      draggable={false}
      onLoad={onReady}
      src={displayedSource}
    />
  );
}
