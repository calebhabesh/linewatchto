"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  rasterMapSource,
  type RasterMapDensity,
  type RasterMapTheme,
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
} from "../app/map-assets";
export {
  rasterMapSource,
  type RasterMapDensity,
  type RasterMapTheme,
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
} from "../app/map-assets";

type BaseRasterMapPlaneProps = {
  theme: RasterMapTheme;
  density: RasterMapDensity;
  className?: string;
  style?: CSSProperties;
  cutoutElementHref?: string | null;
  cutoutMarkup?: string | null;
  svgViewBox?: string;
  onReady?: () => void;
};

export type RasterMapPlaneProps = BaseRasterMapPlaneProps & (
  | { network: "ttc"; plane: TtcRasterMapPlane }
  | { network: "regional"; plane: RegionalRasterMapPlane }
);

const decodedRasterSources = new Set<string>();
const rasterDecodePromises = new Map<string, Promise<void>>();

export function preloadRasterMapSource(source: string): Promise<void> {
  if (decodedRasterSources.has(source)) return Promise.resolve();

  const existing = rasterDecodePromises.get(source);
  if (existing) return existing;

  const image = new Image();
  image.decoding = "async";
  image.src = source;
  const decode = image.decode().then(() => {
    decodedRasterSources.add(source);
  }, () => new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      decodedRasterSources.add(source);
      resolve();
      return;
    }
    image.addEventListener("load", () => {
      decodedRasterSources.add(source);
      resolve();
    }, { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to decode ${source}`)), { once: true });
  })).finally(() => {
    rasterDecodePromises.delete(source);
  });

  rasterDecodePromises.set(source, decode);
  return decode;
}

export function rasterMapSourceIsDecoded(source: string): boolean {
  return decodedRasterSources.has(source);
}

export function RasterMapPlane({
  network,
  plane,
  theme,
  density,
  className = "",
  style,
  cutoutElementHref = null,
  cutoutMarkup = null,
  svgViewBox,
  onReady,
}: RasterMapPlaneProps) {
  const desiredSource = useMemo(
    () => rasterMapSource(network, plane, theme, density),
    [density, network, plane, theme],
  );
  const [displayedSource, setDisplayedSource] = useState<string | null>(() => (
    rasterMapSourceIsDecoded(desiredSource) ? desiredSource : null
  ));
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    void preloadRasterMapSource(desiredSource).then(() => {
      if (!cancelled) setDisplayedSource(desiredSource);
      if (!cancelled) onReadyRef.current?.();
    }, () => undefined);

    return () => {
      cancelled = true;
    };
  }, [desiredSource]);

  if (!displayedSource) return null;

  const hasCutout = Boolean(cutoutMarkup || cutoutElementHref);
  if (svgViewBox && hasCutout) {
    const [viewBoxX = "0", viewBoxY = "0", viewBoxWidth = "0", viewBoxHeight = "0"] = svgViewBox.split(/\s+/);
    const maskId = `${network}-${plane}-raster-mask`;
    return (
      <svg
        aria-hidden="true"
        className={`raster-map-plane raster-map-plane--${plane} ${className}`.trim()}
        style={style}
        viewBox={svgViewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id={`${maskId}-black-alpha`} colorInterpolationFilters="sRGB">
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius={network === "regional" ? "4" : "3"}
              result="expandedAlpha"
            />
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
      style={style}
      decoding="sync"
      draggable={false}
      onLoad={onReady}
      src={displayedSource}
    />
  );
}
