import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronGlyphLane,
  HourglassGlyphLane,
  PlannedClosureIconLane,
  SuspensionGlyphLane,
  SuspensionNoEntryLane,
} from "./GlyphLanes";
import { DELAY_RAIL_COLOR, RSZ_IMPACT_COLOR, SUSPENSION_COLOR } from "./LineAlertOverlays";

export type OverlayLaneSampleKind = "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";

// Samples use the System Map's own tube width, colours, glyph lanes and
// spacing (TTC overlay units, a glyph every 56), drawn still: the guides are
// informational graphics. Every sample draws at one scale, so glyphs are the
// same size in every row; a sample's width follows its glyphs.
const TUBE_WIDTH = 96;
const HALF = TUBE_WIDTH / 2;
/** Pixels per overlay unit; the widest sample (two-way speed zone) fits 88 px. */
const SCALE = 0.25;
/** Space between the outermost glyphs and the tube's rounded ends, about one glyph gap. */
const END_GAP = 22;

const TUBE_COLOR: Record<OverlayLaneSampleKind, string> = {
  suspension: SUSPENSION_COLOR,
  delay: DELAY_RAIL_COLOR,
  "reduced-speed-zone": RSZ_IMPACT_COLOR,
  "planned-closure": "var(--planned-preview-rail)",
};

const path = (length: number) => `M 0 0 L ${length} 0`;

/**
 * The glyphs a lane draws, as LineAlertOverlays chooses them, along a path
 * long enough for a short, balanced run: alternating lanes start and end on
 * an icon (five glyphs), speed zones show five chevrons a row.
 */
function laneGlyphs(kind: OverlayLaneSampleKind, oneWay: boolean): { glyphs: ReactNode; length: number } {
  switch (kind) {
    case "reduced-speed-zone": {
      const travelDirection = oneWay ? "forward" : "bidirectional";
      return {
        length: 280,
        glyphs: (
          <g className="rsz-chevron-lanes">
            {oneWay ? (
              <ChevronGlyphLane pathD={path(280)} step={56} direction="forward" travelDirection={travelDirection} still />
            ) : (
              // Both rows span the same stretch, six chevrons each. On the map
              // the rows share one path, so the reverse row starts a step past
              // the forward row's first chevron and each row leaves an empty
              // step at its own end; the sample fills both.
              <>
                <ChevronGlyphLane pathD="M 0 0 L 336 0" step={56} direction="forward" travelDirection={travelDirection} still />
                <ChevronGlyphLane pathD="M -56 0 L 280 0" step={56} direction="reverse" travelDirection={travelDirection} still />
              </>
            )}
          </g>
        ),
      };
    }
    case "delay":
      return oneWay
        ? { length: 280, glyphs: <HourglassGlyphLane pathD={path(280)} step={56} direction="forward" travelDirection="forward" still /> }
        : { length: 280, glyphs: <HourglassGlyphLane pathD={path(280)} step={28} direction="forward" travelDirection="forward" onlyHourglasses still /> };
    case "suspension":
      return oneWay
        ? { length: 280, glyphs: <SuspensionGlyphLane pathD={path(280)} step={56} direction="forward" travelDirection="forward" still /> }
        : { length: 352, glyphs: <SuspensionNoEntryLane pathD={path(352)} step={88} /> };
    case "planned-closure":
      return {
        length: 336,
        glyphs: <PlannedClosureIconLane pathD={path(336)} travelDirection={oneWay ? "forward" : "bidirectional"} still />,
      };
  }
}

/** A short, still sample of a line alert's overlay, one way or both ways, for the guides. */
export function OverlayLaneSample({ kind, oneWay, className = "" }: {
  kind: OverlayLaneSampleKind;
  oneWay: boolean;
  className?: string;
}) {
  const { glyphs, length } = laneGlyphs(kind, oneWay);
  const glyphRef = useRef<SVGGElement>(null);
  // The glyphs' drawn extent along the lane. Lanes place their glyphs after
  // mounting, so measure once they have drawn; until then the sample stays
  // hidden at its path's size.
  const [extent, setExtent] = useState<{ from: number; to: number } | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;
    const measure = () => {
      const box = glyphRef.current?.getBBox();
      if (box && box.width > 0) {
        setExtent({ from: box.x, to: box.x + box.width });
      } else if (++tries < 60) {
        frame = requestAnimationFrame(measure);
      }
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [kind, oneWay]);

  const from = (extent?.from ?? 0) - END_GAP;
  const to = (extent?.to ?? length) + END_GAP;
  const viewWidth = Math.max(to - from, TUBE_WIDTH);
  return (
    <svg
      className={className}
      viewBox={`${from} ${-HALF} ${viewWidth} ${TUBE_WIDTH}`}
      width={Math.round(viewWidth * SCALE)}
      height={Math.round(TUBE_WIDTH * SCALE)}
      style={extent ? undefined : { visibility: "hidden" }}
      aria-hidden="true"
      focusable="false"
    >
      {/* Round caps reach HALF past each end, so the visible tube spans the view box. */}
      <path
        d={`M ${from + HALF} 0 L ${from + viewWidth - HALF} 0`}
        fill="none"
        stroke={TUBE_COLOR[kind]}
        strokeWidth={TUBE_WIDTH}
        strokeLinecap="round"
      />
      <g ref={glyphRef}>{glyphs}</g>
    </svg>
  );
}
