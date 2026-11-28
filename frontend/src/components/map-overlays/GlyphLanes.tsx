import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TravelDirection } from "../../app/linewatch-data";
import { PlannedClosureIcon } from "../PlannedClosureIcon";
import { glyphRipplePhase, installGlyphMotion, registerGlyphRippleLane } from "./glyph-motion";
import { laneGlyphs, type LaneGlyph } from "./glyph-placement";
import type { MapOverlayPlane } from "./overlay-plane";

// Glyph art and spacing are designed in TTC overlay units. `unit` scales them
// to a map's own units (MapOverlayPlane.unit), so both maps draw one design.
function scaled(unit: number) {
  return unit === 1 ? "" : ` scale(${unit})`;
}

/**
 * Paired lanes' slots: an icon a quarter of the way in, then its arrow three
 * quarters in, so the pairs alternate evenly and every gap between stations
 * holds whole pairs.
 */
const ICON_THEN_ARROW = [0.25, 0.75];
/** The stations a lane lays its glyphs out between: the map's dots and pill stations. */
export type GlyphLaneStations = Pick<MapOverlayPlane, "outlineDots" | "outlineCutouts">;
const NO_STATIONS: GlyphLaneStations = { outlineDots: [], outlineCutouts: [] };

/** Lanes place their glyphs once mounted, after their tube's first frame. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);
  return mounted;
}

function glyphTransform(glyph: LaneGlyph, rotate: boolean, unit: number): string {
  return rotate
    ? `translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotation})${scaled(unit)}`
    : `translate(${glyph.x} ${glyph.y})${scaled(unit)}`;
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

/**
 * Alert glyphs at rest along a lane, laid out between the stations it passes
 * (glyph-placement.ts); alert overlays never move (map-renderer-parity.md).
 */
function GlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  renderGlyph,
  rotateGlyph = true,
  unit,
  stations,
  pattern,
  ripplePhase,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  renderGlyph: (index: number) => ReactNode;
  rotateGlyph?: boolean | ((index: number) => boolean);
  unit: number;
  stations: GlyphLaneStations;
  pattern?: readonly number[];
  /** Each ripple arrow's order along travel, null for icons (glyph-motion.ts). */
  ripplePhase?: (index: number) => number | null;
}) {
  const mounted = useMounted();
  const laneRef = useRef<SVGGElement>(null);

  const ripple = ripplePhase !== undefined;
  useEffect(() => {
    if (ripple) installGlyphMotion();
  }, [ripple]);

  // A two-way lane's rows run either side of the rail.
  const offset = travelDirection === "bidirectional"
    ? (direction === "reverse" ? 18 : -18) * unit
    : 0;
  const glyphs = useMemo(
    () => mounted ? laneGlyphs(pathD, {
      step: step * unit,
      dots: stations.outlineDots,
      cutouts: stations.outlineCutouts,
      offset,
      direction,
      pattern,
    }) : null,
    [direction, mounted, offset, pathD, pattern, stations, step, unit],
  );

  const rippleArrows = glyphs && ripplePhase
    ? glyphs.filter((_, index) => ripplePhase(index) !== null).length
    : 0;
  useEffect(() => {
    if (rippleArrows === 0 || !laneRef.current) return;
    return registerGlyphRippleLane(laneRef.current, rippleArrows);
  }, [rippleArrows]);

  if (!glyphs) return null;

  return (
    <g ref={laneRef} data-glyph-lane data-glyph-ripple={ripple ? "" : undefined}>
      {glyphs.map((glyph, index) => {
        const shouldRotate = typeof rotateGlyph === "function" ? rotateGlyph(index) : rotateGlyph;
        const phase = ripplePhase?.(index) ?? null;
        return (
          <g
            key={index}
            data-index={index}
            data-ripple-phase={phase === null ? undefined : ""}
            style={phase === null ? undefined : { "--glyph-ripple-phase": glyphRipplePhase(phase) } as CSSProperties}
            transform={glyphTransform(glyph, shouldRotate, unit)}
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
  stations = NO_STATIONS,
  still = false,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  unit?: number;
  /** The map's stations, which glyphs are laid out between (glyph-placement.ts). */
  stations?: GlyphLaneStations;
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
      stations={stations}
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
  stations = NO_STATIONS,
  still = false,
}: {
  pathD: string;
  /** One no-entry sign and its arrow. */
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  unit?: number;
  stations?: GlyphLaneStations;
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
      stations={stations}
      pattern={ICON_THEN_ARROW}
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
  stations = NO_STATIONS,
}: {
  pathD: string;
  step: number;
  unit?: number;
  stations?: GlyphLaneStations;
}) {
  const mounted = useMounted();
  const glyphs = useMemo(
    () => mounted ? laneGlyphs(pathD, {
      step: step * unit,
      dots: stations.outlineDots,
      cutouts: stations.outlineCutouts,
    }) : [],
    [mounted, pathD, stations, step, unit],
  );

  if (glyphs.length === 0) return null;

  return (
    <g className="suspension-no-entry-lane" aria-hidden="true">
      {glyphs.map((point, index) => (
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
  stations = NO_STATIONS,
  still = false,
}: {
  pathD: string;
  /** One hourglass and its arrow; one hourglass with `onlyHourglasses`. */
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  onlyHourglasses?: boolean;
  unit?: number;
  stations?: GlyphLaneStations;
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
      stations={stations}
      pattern={onlyHourglasses ? undefined : ICON_THEN_ARROW}
      ripplePhase={onlyHourglasses || still ? undefined : oddGlyphs}
      renderGlyph={(index) => {
        const isHourglass = onlyHourglasses || index % 2 === 0;
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

/**
 * A planned closure's calendars, 112 units apart; a one-way closure follows
 * each with its direction arrow (ICON_THEN_ARROW).
 */
export function PlannedClosureIconLane({
  pathD,
  travelDirection,
  unit = 1,
  stations = NO_STATIONS,
  still = false,
}: {
  pathD: string;
  travelDirection: TravelDirection;
  unit?: number;
  stations?: GlyphLaneStations;
  /** Never ripples (the site guide's still samples). */
  still?: boolean;
}) {
  const mounted = useMounted();
  const direction = travelDirection === "bidirectional" ? null : travelDirection;

  // One-way pairs come in travel order: calendar, then its arrow.
  const pairs = useMemo(() => {
    if (!mounted) return [];
    const glyphs = laneGlyphs(pathD, {
      step: 112 * unit,
      dots: stations.outlineDots,
      cutouts: stations.outlineCutouts,
      direction: direction ?? "forward",
      pattern: direction ? ICON_THEN_ARROW : undefined,
    });
    if (!direction) return glyphs.map((icon) => ({ icon, arrow: null }));
    return glyphs.flatMap((icon, index) => index % 2 === 0 ? [{ icon, arrow: glyphs[index + 1] ?? null }] : []);
  }, [direction, mounted, pathD, stations, unit]);

  // Ripple: a one-way closure's arrows, counted the travel way.
  const laneRef = useRef<SVGGElement>(null);
  const rippleArrows = !still && direction ? pairs.length : 0;
  useEffect(() => {
    if (rippleArrows > 0) installGlyphMotion();
  }, [rippleArrows]);
  useEffect(() => {
    if (rippleArrows === 0 || !laneRef.current) return;
    return registerGlyphRippleLane(laneRef.current, rippleArrows);
  }, [rippleArrows]);

  if (pairs.length === 0) return null;

  return (
    <g
      ref={laneRef}
      className="planned-closure-icon-lane"
      aria-hidden="true"
      data-glyph-ripple={rippleArrows > 0 ? "" : undefined}
    >
      {pairs.map(({ icon, arrow }, index) => {
        if (!direction) {
          return (
            <g key={`${icon.x}-${icon.y}-${index}`} transform={`translate(${icon.x} ${icon.y})${scaled(unit)}`}>
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

        return (
          <g
            key={`${icon.x}-${icon.y}-${index}`}
            className={`planned-closure-lane-glyph planned-closure-lane-glyph--${direction}`}
            data-ripple-phase=""
            style={{ "--glyph-ripple-phase": glyphRipplePhase(index) } as CSSProperties}
          >
            <g transform={`translate(${icon.x} ${icon.y})${scaled(unit)}`}>
              <PlannedClosureIcon
                className="planned-closure-map-icon"
                x={-36}
                y={-36}
                width={72}
                height={72}
                strokeWidth={2.25}
              />
            </g>
            {arrow ? (
              <g transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.rotation})${scaled(unit)}`}>
                <DirectionChevron kind="planned" />
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
