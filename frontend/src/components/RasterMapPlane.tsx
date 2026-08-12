"use client";

import { useEffect, useMemo, useState } from "react";

export type RasterMapTheme = "light" | "dark" | "high-contrast";
export type RasterMapDensity = "mobile" | "desktop";

type RasterMapPlaneProps = {
  network: "ttc" | "regional";
  plane: "background" | "foreground" | "labels";
  theme: RasterMapTheme;
  density: RasterMapDensity;
  className?: string;
  cutoutElementHref?: string | null;
  cutoutMarkup?: string | null;
  svgViewBox?: string;
  onReady?: () => void;
};

export function rasterMapSource(
  network: "ttc" | "regional",
  plane: "background" | "foreground" | "labels",
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
  cutoutElementHref = null,
  cutoutMarkup = null,
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
    const [viewBoxX = "0", viewBoxY = "0", viewBoxWidth = "0", viewBoxHeight = "0"] = svgViewBox.split(/\s+/);
    const maskId = `${network}-${plane}-raster-mask`;
    return (
      <svg
        aria-hidden="true"
        className={`raster-map-plane raster-map-plane--${plane} ${className}`.trim()}
        viewBox={svgViewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id={`${maskId}-black-alpha`} colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="expandedAlpha" />
            <feColorMatrix
              in="expandedAlpha"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
          </filter>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={viewBoxHeight}>
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={viewBoxHeight} fill="white" />
            {cutoutMarkup ? (
              <g
                filter={`url(#${maskId}-black-alpha)`}
                dangerouslySetInnerHTML={{ __html: cutoutMarkup }}
              />
            ) : cutoutElementHref ? (
              <use
                href={cutoutElementHref}
                filter={`url(#${maskId}-black-alpha)`}
                visibility="visible"
              />
            ) : null}
          </mask>
        </defs>
        <image
          href={displayedSource}
          x={viewBoxX}
          y={viewBoxY}
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
