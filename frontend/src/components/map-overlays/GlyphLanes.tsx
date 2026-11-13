import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { extrapolatedPathFrame, samplePath, type MapPoint } from "../../app/map-geometry";
import type { TravelDirection } from "../../app/linewatch-data";
import { PlannedClosureIcon } from "../PlannedClosureIcon";
import { glyphRipplePhase, installGlyphMotion, registerGlyphRippleLane } from "./glyph-motion";

// Glyph art and spacing are designed in TTC overlay units. `unit` scales them
// to a map's own units (MapOverlayPlane.unit), so both maps draw one design.
function scaled(unit: number) {
  return unit === 1 ? "" : ` scale(${unit})`;
}

type GlyphLaneMetrics = {
  count: number;
  frames: Array<{
    x: number;
    y: number;
    rotation: number;
  }>;
};

function measureGlyphLane(
  pathD: string,
  requestedStep: number,
  normalOffset: number,
  direction: "forward" | "reverse",
): GlyphLaneMetrics | null {
  if (typeof document === "undefined") return null;

  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    if (length <= 0) return null;

    const count = Math.max(1, Math.floor(length / requestedStep));
    let lanePathD = pathD;

    if (normalOffset !== 0) {
      // Offset the two bidirectional lanes to either side of the rail.
      const sampleCount = Math.max(2, Math.ceil(length / 12));
      const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
        const distance = length * index / sampleCount;
        const frame = extrapolatedPathFrame(path, length, distance);
        if (!frame) return null;
        const angle = Math.atan2(frame.tangent.y, frame.tangent.x);
        return {
          x: frame.point.x - normalOffset * Math.sin(angle),
          y: frame.point.y + normalOffset * Math.cos(angle),
        };
      }).filter((point): point is MapPoint => Boolean(point));

      if (points.length >= 2) {
        lanePathD = points
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(" ");
      }
    }

    // Glyphs sit on the offset lane's own distance and tangent, including on
    // curves where the two lanes have different lengths.
    path.setAttribute("d", lanePathD);
    const laneLength = path.getTotalLength();
    const frames = Array.from({ length: count }, (_, index) => {
      const progress = index / count;
      const distance = laneLength * (direction === "forward" ? progress : 1 - progress);
      const frame = extrapolatedPathFrame(path, laneLength, distance);
      if (!frame) return { x: 0, y: 0, rotation: 0 };
      return {
        x: frame.point.x,
        y: frame.point.y,
        rotation: Math.atan2(frame.tangent.y, frame.tangent.x) * (180 / Math.PI)
          + (direction === "reverse" ? 180 : 0),
      };
    });

    return { count, frames };
  } catch (error) {
    console.error("Error measuring SVG glyph lane:", error);
    return null;
  }
}

function glyphLaneTransform(
  metrics: GlyphLaneMetrics,
  index: number,
  rotate: boolean,
  unit: number,
): string {
  const frame = metrics.frames[index];
  if (!frame) return "";
  return rotate
    ? `translate(${frame.x} ${frame.y}) rotate(${frame.rotation})${scaled(unit)}`
    : `translate(${frame.x} ${frame.y})${scaled(unit)}`;
}

/**
 * The one direction chevron every line-alert lane draws: the Reduced Speed
 * Zone design (20 x 20 units, 6-unit round stroke), coloured by kind
 * (impact-overlays.css, .map-direction-chevron). Lanes space their glyphs
 * at the same 56-unit pitch.
 */
function DirectionChevron({ kind }: { kind: "rsz" | "delay" | "suspension" | "planned" }) {
  const kindClass = {
    rsz: "rsz-chevron",
    delay: "delay-direction-chevron",
    suspension: "suspension-direction-chevron",
    planned: "planned-closure-direction-chevron",
  }[kind];
  return <path d="M -12 -10 L 8 0 L -12 10" className={`map-direction-chevron ${kindClass}`} aria-hidden="true" />;
}

// Ripple phases: every glyph is an arrow, or arrows alternate with
// icons from the second glyph. Lane indexes already count the travel way.
const everyGlyph = (index: number) => index;
const oddGlyphs = (index: number) => (index % 2 === 1 ? (index - 1) / 2 : null);

/** Alert glyphs at rest along a lane; alert overlays never move (map-renderer-parity.md). */
function GlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  renderGlyph,
  rotateGlyph = true,
  unit,
  ripplePhase,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  renderGlyph: (index: number) => ReactNode;
  rotateGlyph?: boolean | ((index: number) => boolean);
  unit: number;
  /** Each ripple arrow's order along travel, null for icons (glyph-motion.ts). */
  ripplePhase?: (index: number) => number | null;
}) {
  const [mounted, setMounted] = useState(false);
  const laneRef = useRef<SVGGElement>(null);

  const ripple = ripplePhase !== undefined;
  useEffect(() => {
    if (ripple) installGlyphMotion();
  }, [ripple]);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const normalOffset = travelDirection === "bidirectional"
    ? (direction === "reverse" ? 18 : -18) * unit
    : 0;
  const metrics = useMemo(
    () => mounted ? measureGlyphLane(pathD, step * unit, normalOffset, direction) : null,
    [direction, mounted, normalOffset, pathD, step, unit],
  );

  const rippleArrows = metrics && ripplePhase
    ? Array.from({ length: metrics.count }, (_, index) => ripplePhase(index)).filter((phase) => phase !== null).length
    : 0;
  useEffect(() => {
    if (rippleArrows === 0 || !laneRef.current) return;
    return registerGlyphRippleLane(laneRef.current, rippleArrows);
  }, [rippleArrows]);

  if (!metrics) return null;

  return (
    <g ref={laneRef} data-glyph-lane data-glyph-ripple={ripple ? "" : undefined}>
      {Array.from({ length: metrics.count }, (_, index) => {
        const shouldRotate = typeof rotateGlyph === "function" ? rotateGlyph(index) : rotateGlyph;
        const phase = ripplePhase?.(index) ?? null;
        return (
          <g
            key={index}
            data-index={index}
            data-ripple-phase={phase === null ? undefined : ""}
            style={phase === null ? undefined : { "--glyph-ripple-phase": glyphRipplePhase(phase) } as CSSProperties}
            transform={glyphLaneTransform(metrics, index, shouldRotate, unit)}
          >
            {renderGlyph(index)}
          </g>
        );
      })}
    </g>
  );
}

export function ChevronGlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  unit = 1,
  still = false,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  unit?: number;
  /** Never ripples (the site guide's still samples). */
  still?: boolean;
}) {
  return (
    <GlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      unit={unit}
      ripplePhase={still ? undefined : everyGlyph}
      renderGlyph={() => <DirectionChevron kind="rsz" />}
    />
  );
}

export function SuspensionGlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  unit = 1,
  still = false,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  unit?: number;
  /** Never ripples (the site guide's still samples). */
  still?: boolean;
}) {
  return (
    <GlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      unit={unit}
      rotateGlyph={(index) => index % 2 !== 0}
      ripplePhase={still ? undefined : oddGlyphs}
      renderGlyph={(index) => index % 2 === 0 ? (
        <SuspensionNoEntryGlyph />
      ) : (
        <DirectionChevron kind="suspension" />
      )}
    />
  );
}

function SuspensionNoEntryGlyph({
  className = "",
  scale = 2.2,
}: {
  className?: string;
  scale?: number;
}) {
  return (
    <g
      className={`suspension-no-entry-glyph${className ? ` ${className}` : ""}`}
      transform={`translate(${-12 * scale}, ${-12 * scale}) scale(${scale})`}
      stroke="#ffffff"
      fill="none"
      strokeWidth="3.2"
    >
      <circle cx="12" cy="12" r="10.5" />
      <line x1="19.64" y1="4.36" x2="4.36" y2="19.64" />
    </g>
  );
}

export function SuspensionNoEntryLane({
  pathD,
  step,
  unit = 1,
}: {
  pathD: string;
  step: number;
  unit?: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const { points } = useMemo(() => {
    if (!mounted) return { points: [], step };
    return samplePath(pathD, step * unit);
  }, [mounted, pathD, step, unit]);

  if (!mounted || points.length === 0) return null;

  return (
    <g className="suspension-no-entry-lane" aria-hidden="true">
      {points.map((point, index) => (
        <g
          key={`${point.x}-${point.y}-${index}`}
          transform={`translate(${point.x} ${point.y})${scaled(unit)}`}
        >
          <SuspensionNoEntryGlyph scale={2.65} />
        </g>
      ))}
    </g>
  );
}

export function HourglassGlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  onlyHourglasses = false,
  unit = 1,
  still = false,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  onlyHourglasses?: boolean;
  unit?: number;
  /** Never ripples (the site guide's still samples). */
  still?: boolean;
}) {
  return (
    <GlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      unit={unit}
      ripplePhase={onlyHourglasses || still ? undefined : oddGlyphs}
      renderGlyph={(index) => {
        const isHourglass = index % 2 === 0;
        if (!isHourglass && onlyHourglasses) return null;
        return isHourglass ? (
          <g transform="scale(0.09) translate(-550, -512)" className="delay-hourglass">
                <path
                  d="M576 512c0 190.72 448 345.6-25.6 345.6s-25.6-154.88-25.6-345.6-448-345.6 25.6-345.6 25.6 154.88 25.6 345.6z"
                  fill="#F7E6A3"
                />
                <path
                  d="M550.4 870.4c-147.2 0-212.48-14.08-226.56-48.64-14.08-33.28 23.04-71.68 71.68-121.6 51.2-52.48 116.48-120.32 116.48-188.16 0-67.84-65.28-135.68-117.76-189.44-47.36-48.64-85.76-87.04-71.68-121.6C337.92 167.68 403.2 153.6 550.4 153.6s212.48 14.08 226.56 48.64c14.08 33.28-23.04 71.68-71.68 121.6-51.2 52.48-116.48 120.32-116.48 188.16 0 67.84 65.28 135.68 117.76 189.44 47.36 48.64 85.76 87.04 71.68 121.6C762.88 856.32 697.6 870.4 550.4 870.4z m0-691.2c-157.44 0-197.12 17.92-203.52 33.28-7.68 17.92 29.44 56.32 65.28 93.44 55.04 57.6 125.44 128 125.44 207.36 0 79.36-69.12 149.76-125.44 207.36-35.84 37.12-72.96 75.52-65.28 93.44 6.4 12.8 46.08 30.72 203.52 30.72s197.12-17.92 203.52-33.28c7.68-17.92-29.44-56.32-65.28-93.44C632.32 661.76 563.2 591.36 563.2 512c0-79.36 69.12-149.76 125.44-207.36 35.84-37.12 72.96-75.52 65.28-93.44-6.4-14.08-46.08-32-203.52-32z"
                  fill="#0284c7"
                />
                <path
                  d="M819.2 153.6c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z"
                  fill="#7dd3fc"
                />
                <path
                  d="M793.6 192H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z"
                  fill="#0369a1"
                />
                <path
                  d="M819.2 883.2c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z"
                  fill="#7dd3fc"
                />
                <path
                  d="M793.6 921.6H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z"
                  fill="#0369a1"
                />
                <path d="M307.2 179.2h25.6v665.6h-25.6z" fill="#0369a1" />
                <path d="M768 179.2h25.6v665.6h-25.6z" fill="#0369a1" />
          </g>
        ) : (
          <DirectionChevron kind="delay" />
        );
      }}
    />
  );
}

export function PlannedClosureIconLane({
  pathD,
  travelDirection,
  unit = 1,
  still = false,
}: {
  pathD: string;
  travelDirection: TravelDirection;
  unit?: number;
  /** Never ripples (the site guide's still samples). */
  still?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const pathMetrics = useMemo(() => {
    if (!mounted || typeof document === "undefined") return [];

    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      const length = path.getTotalLength();
      if (length <= 0) return { length: 0, points: [] };

      const isDirectional = travelDirection !== "bidirectional";
      const count = Math.max(1, isDirectional ? Math.round(length / (112 * unit)) : Math.floor(length / (112 * unit)));
      const step = length / count;
      return {
        length,
        points: Array.from({ length: count }, (_, index) => {
          const distance = isDirectional
            ? (index + 0.25) * step
            : (length * (index + 1)) / (count + 1);
          const chevronDistance = (distance + step / 2) % length;
          const point = path.getPointAtLength(distance);
          const chevronPoint = path.getPointAtLength(chevronDistance);
          const before = path.getPointAtLength(Math.max(0, chevronDistance - 4 * unit));
          const after = path.getPointAtLength(Math.min(length, chevronDistance + 4 * unit));
          return {
            x: point.x,
            y: point.y,
            chevronX: chevronPoint.x,
            chevronY: chevronPoint.y,
            angle: Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI),
          };
        }),
      };
    } catch {
      return { length: 0, points: [] };
    }
  }, [mounted, pathD, travelDirection, unit]);

  // Ripple: a one-way closure's chevrons, counted the travel way
  // (points run from the path's start for both directions).
  const laneRef = useRef<SVGGElement>(null);
  const rippleArrows = !still && travelDirection !== "bidirectional" && !Array.isArray(pathMetrics) ? pathMetrics.points.length : 0;
  useEffect(() => {
    if (rippleArrows > 0) installGlyphMotion();
  }, [rippleArrows]);
  useEffect(() => {
    if (rippleArrows === 0 || !laneRef.current) return;
    return registerGlyphRippleLane(laneRef.current, rippleArrows);
  }, [rippleArrows]);

  if (Array.isArray(pathMetrics) || pathMetrics.points.length === 0) return null;

  return (
    <g
      ref={laneRef}
      className="planned-closure-icon-lane"
      aria-hidden="true"
      data-glyph-ripple={rippleArrows > 0 ? "" : undefined}
    >
      {pathMetrics.points.map((point, index) => {
        if (travelDirection === "bidirectional") {
          return (
            <g key={`${point.x}-${point.y}-${index}`} transform={`translate(${point.x} ${point.y})${scaled(unit)}`}>
              <PlannedClosureIcon
                className="planned-closure-map-icon planned-closure-map-icon--static"
                x={-36}
                y={-36}
                width={72}
                height={72}
                strokeWidth={2.25}
              />
            </g>
          );
        }

        const direction = travelDirection;
        const staticAngle = point.angle + (direction === "reverse" ? 180 : 0);

        return (
          <g
            key={`${point.x}-${point.y}-${index}`}
            className={`planned-closure-lane-glyph planned-closure-lane-glyph--${direction}`}
            data-ripple-phase=""
            style={{ "--glyph-ripple-phase": glyphRipplePhase(direction === "reverse" ? pathMetrics.points.length - 1 - index : index) } as CSSProperties}
          >
            <g transform={`translate(${point.x} ${point.y})${scaled(unit)}`}>
              <PlannedClosureIcon
                className="planned-closure-map-icon"
                x={-36}
                y={-36}
                width={72}
                height={72}
                strokeWidth={2.25}
              />
            </g>
            <g transform={`translate(${point.chevronX} ${point.chevronY}) rotate(${staticAngle})${scaled(unit)}`}>
              <DirectionChevron kind="planned" />
            </g>
          </g>
        );
      })}
    </g>
  );
}
