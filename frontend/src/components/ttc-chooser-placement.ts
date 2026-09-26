/**
 * TTC Overlap Chooser Placement
 *
 * Pure screen layout and placement decisions for the TTC map overlap chooser.
 * Calculates optimal chooser coordinates, margin clamping, collision avoidance
 * against station labels/corridors and UI keepouts, and height compaction.
 *
 * No DOM queries or React dependencies. Actual DOM measurements remain
 * with the DOM owner.
 */

import type { MapBounds, MapPoint } from "../app/map-geometry.ts";
import type { MapOverlapIndicatorSize } from "./map-overlap-badges.ts";

export type SvgBounds = MapBounds;
export type OverlapBadgeSize = MapOverlapIndicatorSize;

export const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
export const MAP_SVG_TO_CSS_SCALE = 4500 / MAP_VIEWBOX_BOUNDS.width;
export const OVERLAP_CHOOSER_WIDTH = 360;
export const OVERLAP_CHOOSER_MOBILE_BREAKPOINT = 640;
export const OVERLAP_CHOOSER_MOBILE_WIDTH = 280;
export const OVERLAP_CHOOSER_TARGET_GAP = 16;
export const OVERLAP_CHOOSER_GAP_DEVIATION_WEIGHT = 4;
export const OVERLAP_CHOOSER_UI_GAP = 8;
export const MAX_SOFT_OVERLAY_DISTANCE_PENALTY = 48;
export const OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT = 142;
export const OVERLAP_CHOOSER_HEIGHT_STEP = 4;

export type OverlapChooserScreenBadgeTarget = {
  position: MapPoint;
  chooserPosition: MapPoint;
  size: OverlapBadgeSize;
  chooserSize: OverlapBadgeSize;
  protectedBoxes: SvgBounds[];
};

export type OverlapChooserScreenLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

export function boundsForBadgePosition(position: MapPoint, size: OverlapBadgeSize): SvgBounds {
  return {
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function expandBox(box: SvgBounds, padding: number): SvgBounds {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

export function boxesIntersect(a: SvgBounds, b: SvgBounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function boxIntersectionArea(a: SvgBounds, b: SvgBounds): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

export function boundsListsMatch(left: SvgBounds[], right: SvgBounds[]): boolean {
  return left.length === right.length && left.every((box, index) => {
    const other = right[index];
    return Boolean(other)
      && Math.abs(box.x - other.x) < 0.5
      && Math.abs(box.y - other.y) < 0.5
      && Math.abs(box.width - other.width) < 0.5
      && Math.abs(box.height - other.height) < 0.5;
  });
}

export function boundsContainingBoxes(boxes: SvgBounds[]): SvgBounds | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function minimumBoundsGap(a: SvgBounds, b: SvgBounds): number {
  const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const verticalGap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(horizontalGap, verticalGap);
}

export function minimumGapToBounds(bounds: SvgBounds, boxes: SvgBounds[]): number {
  let minimumGap = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    minimumGap = Math.min(minimumGap, minimumBoundsGap(bounds, box));
    if (minimumGap === 0) return 0;
  }
  return minimumGap;
}

export function nearestProtectedBoxesToPoint(boxes: SvgBounds[], point: MapPoint, limit: number): SvgBounds[] {
  const pointBounds = { x: point.x, y: point.y, width: 0, height: 0 };
  return [...boxes]
    .sort((a, b) => minimumBoundsGap(a, pointBounds) - minimumBoundsGap(b, pointBounds))
    .slice(0, limit);
}

export function overlapChooserSize(
  impactCount: number,
  viewportWidth = OVERLAP_CHOOSER_WIDTH + 32,
): OverlapBadgeSize {
  const isMobile = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const maximumWidth = isMobile ? OVERLAP_CHOOSER_MOBILE_WIDTH : OVERLAP_CHOOSER_WIDTH;
  const horizontalMargin = isMobile ? 48 : 32;
  return {
    width: Math.max(240, Math.min(maximumWidth, viewportWidth - horizontalMargin)),
    height: isMobile
      ? Math.min(380, 56 + impactCount * 64)
      : Math.min(440, 68 + impactCount * 88),
  };
}

export function clampChooserScreenCoordinate(
  coordinate: number,
  chooserLength: number,
  viewportLength: number,
  margin: number,
): number {
  const minimum = margin + chooserLength / 2;
  const maximum = Math.max(minimum, viewportLength - margin - chooserLength / 2);
  return Math.min(maximum, Math.max(minimum, coordinate));
}

export function chooserCenterAvoidsProtectedBoxes(
  center: MapPoint,
  chooserSize: OverlapBadgeSize,
  protectedBoxes: SvgBounds[],
): boolean {
  const chooserBox = {
    x: center.x - chooserSize.width / 2,
    y: center.y - chooserSize.height / 2,
    width: chooserSize.width,
    height: chooserSize.height,
  };
  return protectedBoxes.every((box) => !boxesIntersect(chooserBox, box));
}

export function chooserCenterFitsViewport(
  center: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  margin: number,
): boolean {
  return center.x - chooserSize.width / 2 >= margin
    && center.x + chooserSize.width / 2 <= viewportSize.width - margin
    && center.y - chooserSize.height / 2 >= margin
    && center.y + chooserSize.height / 2 <= viewportSize.height - margin;
}

export function chooserKeepoutEdgeCandidates(
  proposed: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  keepoutBoxes: SvgBounds[],
  margin: number,
  edgeGap: number = OVERLAP_CHOOSER_UI_GAP,
): MapPoint[] {
  const clampedX = clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin);
  const clampedY = clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin);
  const candidates = keepoutBoxes.flatMap((box) => [
    {
      x: clampedX,
      y: box.y - chooserSize.height / 2 - edgeGap,
    },
    {
      x: clampedX,
      y: box.y + box.height + chooserSize.height / 2 + edgeGap,
    },
    {
      x: box.x - chooserSize.width / 2 - edgeGap,
      y: clampedY,
    },
    {
      x: box.x + box.width + chooserSize.width / 2 + edgeGap,
      y: clampedY,
    },
  ]);

  return candidates.sort((a, b) =>
    Math.hypot(a.x - proposed.x, a.y - proposed.y)
      - Math.hypot(b.x - proposed.x, b.y - proposed.y),
  );
}

export function chooserKeepoutGridCandidates(
  proposed: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  keepoutBoxes: SvgBounds[],
  margin: number,
): MapPoint[] {
  const minimumX = margin + chooserSize.width / 2;
  const maximumX = viewportSize.width - margin - chooserSize.width / 2;
  const minimumY = margin + chooserSize.height / 2;
  const maximumY = viewportSize.height - margin - chooserSize.height / 2;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const xCoordinates = new Set([minimumX, maximumX, Math.min(maximumX, Math.max(minimumX, proposed.x))]);
  const yCoordinates = new Set([minimumY, maximumY, Math.min(maximumY, Math.max(minimumY, proposed.y))]);
  keepoutBoxes.forEach((box) => {
    xCoordinates.add(box.x - chooserSize.width / 2);
    xCoordinates.add(box.x + box.width + chooserSize.width / 2);
    yCoordinates.add(box.y - chooserSize.height / 2);
    yCoordinates.add(box.y + box.height + chooserSize.height / 2);
  });

  return [...xCoordinates]
    .filter((x) => x >= minimumX && x <= maximumX)
    .flatMap((x) => [...yCoordinates]
      .filter((y) => y >= minimumY && y <= maximumY)
      .map((y) => ({ x, y })));
}

export function boundedChooserViewportCandidates(
  anchor: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  margin: number,
): MapPoint[] {
  const minimumX = margin + chooserSize.width / 2;
  const maximumX = viewportSize.width - margin - chooserSize.width / 2;
  const minimumY = margin + chooserSize.height / 2;
  const maximumY = viewportSize.height - margin - chooserSize.height / 2;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const nearHorizontalOffset = chooserSize.width / 2 + OVERLAP_CHOOSER_UI_GAP;
  const nearVerticalOffset = chooserSize.height / 2 + OVERLAP_CHOOSER_UI_GAP;
  const xCoordinates = [
    minimumX,
    clampChooserScreenCoordinate(anchor.x - nearHorizontalOffset, chooserSize.width, viewportSize.width, margin),
    clampChooserScreenCoordinate(anchor.x, chooserSize.width, viewportSize.width, margin),
    clampChooserScreenCoordinate(anchor.x + nearHorizontalOffset, chooserSize.width, viewportSize.width, margin),
    maximumX,
  ];
  const yCoordinates = [
    minimumY,
    clampChooserScreenCoordinate(anchor.y - nearVerticalOffset, chooserSize.height, viewportSize.height, margin),
    clampChooserScreenCoordinate(anchor.y, chooserSize.height, viewportSize.height, margin),
    clampChooserScreenCoordinate(anchor.y + nearVerticalOffset, chooserSize.height, viewportSize.height, margin),
    maximumY,
  ];
  const seen = new Set<string>();
  return xCoordinates.flatMap((x) => yCoordinates.flatMap((y) => {
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ x, y }];
  }));
}

export function scoreChooserScreenCandidate(
  center: MapPoint,
  anchor: MapPoint,
  chooserSize: OverlapBadgeSize,
  referencedAlertBoxes: SvgBounds[],
  softCollisionBoxes: SvgBounds[],
): number {
  const chooserBox = boundsForBadgePosition(center, chooserSize);
  const nearestX = Math.max(chooserBox.x, Math.min(anchor.x, chooserBox.x + chooserBox.width));
  const nearestY = Math.max(chooserBox.y, Math.min(anchor.y, chooserBox.y + chooserBox.height));
  const proximity = Math.hypot(anchor.x - nearestX, anchor.y - nearestY);
  const referencedAlertGap = referencedAlertBoxes.length > 0
    ? minimumGapToBounds(chooserBox, referencedAlertBoxes)
    : OVERLAP_CHOOSER_TARGET_GAP;
  const gapDeviation = Math.abs(referencedAlertGap - OVERLAP_CHOOSER_TARGET_GAP);
  const overlapArea = softCollisionBoxes.reduce(
    (total, box) => total + boxIntersectionArea(chooserBox, box),
    0,
  );
  const overlapRatio = Math.min(1, overlapArea / Math.max(1, chooserBox.width * chooserBox.height));
  return proximity
    + gapDeviation * OVERLAP_CHOOSER_GAP_DEVIATION_WEIGHT
    + overlapRatio * MAX_SOFT_OVERLAY_DISTANCE_PENALTY;
}

export function overlapChooserScreenLayout(
  badge: OverlapChooserScreenBadgeTarget,
  mapTransform: { x: number; y: number; scale: number },
  viewportSize: { width: number; height: number },
  screenKeepoutBoxes: SvgBounds[] = [],
  mapAlertOverlayBoxes: SvgBounds[] = [],
): OverlapChooserScreenLayout {
  const mapContentScale = mapTransform.scale * MAP_SVG_TO_CSS_SCALE;
  const anchor = {
    x: mapTransform.x + badge.position.x * mapContentScale,
    y: mapTransform.y + badge.position.y * mapContentScale,
  };
  const proposed = {
    x: mapTransform.x + badge.chooserPosition.x * mapContentScale,
    y: mapTransform.y + badge.chooserPosition.y * mapContentScale,
  };
  const toScreenBox = (box: SvgBounds): SvgBounds => ({
    x: mapTransform.x + box.x * mapContentScale,
    y: mapTransform.y + box.y * mapContentScale,
    width: box.width * mapContentScale,
    height: box.height * mapContentScale,
  });
  const representedProtectedBoxes = badge.protectedBoxes.map(toScreenBox);
  const alertOverlayProtectedBoxes = mapAlertOverlayBoxes.map(toScreenBox);
  const badgeScreenBox = expandBox({
    x: anchor.x - badge.size.width * mapContentScale / 2,
    y: anchor.y - badge.size.height * mapContentScale / 2,
    width: badge.size.width * mapContentScale,
    height: badge.size.height * mapContentScale,
  }, OVERLAP_CHOOSER_UI_GAP);
  const protectedArea = boundsContainingBoxes(representedProtectedBoxes) ?? {
    x: anchor.x,
    y: anchor.y,
    width: 0,
    height: 0,
  };
  const margin = 16;
  const direction = {
    x: proposed.x - anchor.x,
    y: proposed.y - anchor.y,
  };
  const preferredAxis = Math.abs(direction.x) > Math.abs(direction.y) ? "horizontal" : "vertical";
  const preferredHorizontalSign = direction.x < 0 ? -1 : 1;
  const preferredVerticalSign = direction.y < 0 ? -1 : 1;
  const paddedScreenKeepoutBoxes = screenKeepoutBoxes.map((box) => expandBox(box, OVERLAP_CHOOSER_UI_GAP));
  const requestedSize = badge.chooserSize;
  const minimumHeight = Math.min(
    requestedSize.height,
    Math.max(80, Math.min(OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT, viewportSize.height - margin * 2)),
  );
  const heightCandidates: number[] = [];
  for (let height = requestedSize.height; height > minimumHeight; height -= OVERLAP_CHOOSER_HEIGHT_STEP) {
    heightCandidates.push(height);
  }
  heightCandidates.push(minimumHeight);

  const attemptLayout = (chooserSize: OverlapBadgeSize) => {
    const horizontalCenter = (sign: number, gap: number) => ({
      x: sign < 0
        ? protectedArea.x - chooserSize.width / 2 - gap
        : protectedArea.x + protectedArea.width + chooserSize.width / 2 + gap,
      y: clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin),
    });
    const verticalCenter = (sign: number, gap: number) => ({
      x: clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin),
      y: sign < 0
        ? protectedArea.y - chooserSize.height / 2 - gap
        : protectedArea.y + protectedArea.height + chooserSize.height / 2 + gap,
    });
    const candidatesForGap = (gap: number) => preferredAxis === "horizontal"
      ? [
          horizontalCenter(preferredHorizontalSign, gap),
          horizontalCenter(-preferredHorizontalSign, gap),
          verticalCenter(preferredVerticalSign, gap),
          verticalCenter(-preferredVerticalSign, gap),
        ]
      : [
          verticalCenter(preferredVerticalSign, gap),
          verticalCenter(-preferredVerticalSign, gap),
          horizontalCenter(preferredHorizontalSign, gap),
          horizontalCenter(-preferredHorizontalSign, gap),
        ];
    const preferredCandidates = candidatesForGap(OVERLAP_CHOOSER_TARGET_GAP);
    const edgeCandidates = candidatesForGap(0);
    const hardKeepoutBoxes = [badgeScreenBox, ...paddedScreenKeepoutBoxes];
    const uiKeepoutBoxes = paddedScreenKeepoutBoxes;
    const localProtectedBoxes = nearestProtectedBoxesToPoint(representedProtectedBoxes, anchor, 6);
    const alertEdgeCandidates = chooserKeepoutEdgeCandidates(
      proposed,
      chooserSize,
      viewportSize,
      [protectedArea, ...localProtectedBoxes],
      margin,
      OVERLAP_CHOOSER_TARGET_GAP,
    );
    const uiEdgeCandidates = chooserKeepoutEdgeCandidates(
      proposed,
      chooserSize,
      viewportSize,
      hardKeepoutBoxes,
      margin,
    );
    const hardBlockedBoxes = [...representedProtectedBoxes, ...hardKeepoutBoxes];
    const viewportCandidates = boundedChooserViewportCandidates(
      anchor,
      chooserSize,
      viewportSize,
      margin,
    );
    const exhaustiveUiCandidates = chooserKeepoutGridCandidates(
      proposed,
      chooserSize,
      viewportSize,
      hardKeepoutBoxes,
      margin,
    );
    const allCandidates = [
      ...preferredCandidates,
      ...edgeCandidates,
      ...alertEdgeCandidates,
      ...uiEdgeCandidates,
      ...viewportCandidates,
      ...exhaustiveUiCandidates,
    ];
    const validCandidates = allCandidates
      .filter((candidate) =>
        chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
          && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, hardBlockedBoxes),
      );
    const uiSafeCandidates = validCandidates.length > 0 ? [] : [
      ...allCandidates,
    ].filter((candidate) =>
      chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
        && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, uiKeepoutBoxes),
    );
    const badgeOnlyCandidates = validCandidates.length > 0 || uiSafeCandidates.length > 0
      ? []
      : [
          ...preferredCandidates,
          ...edgeCandidates,
          ...viewportCandidates,
          ...exhaustiveUiCandidates,
        ].filter((candidate) =>
          chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
            && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, [badgeScreenBox]),
        );
    const centerCandidates = validCandidates.length > 0
      ? validCandidates
      : uiSafeCandidates.length > 0
        ? uiSafeCandidates
        : badgeOnlyCandidates;
    const center = centerCandidates.reduce<{ position: MapPoint; score: number } | null>((best, position) => {
      const score = scoreChooserScreenCandidate(
        position,
        anchor,
        chooserSize,
        representedProtectedBoxes,
        alertOverlayProtectedBoxes,
      );
      return !best || score < best.score ? { position, score } : best;
    }, null)?.position ?? {
      x: clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin),
      y: clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin),
    };

    return {
      center,
      clearsUiKeepouts: validCandidates.length > 0 || uiSafeCandidates.length > 0,
    };
  };

  let chosenSize = requestedSize;
  let chosenAttempt = attemptLayout(requestedSize);
  for (const height of heightCandidates) {
    const size = { width: requestedSize.width, height };
    const attempt = attemptLayout(size);
    chosenSize = size;
    chosenAttempt = attempt;
    if (attempt.clearsUiKeepouts) break;
  }
  const center = chosenAttempt.center;

  return {
    left: center.x - chosenSize.width / 2,
    top: center.y - chosenSize.height / 2,
    width: chosenSize.width,
    height: chosenSize.height,
    anchorOffsetX: anchor.x - center.x,
    anchorOffsetY: anchor.y - center.y,
  };
}
