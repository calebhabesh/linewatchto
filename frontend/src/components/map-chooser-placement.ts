/**
 * Overlap chooser placement for every System Map.
 *
 * Converts an overlap badge and the overlays of its alerts from map
 * coordinates to viewport pixels through the map's stage transform and the
 * camera, then places the chooser with the screen-space placer. Pure: the
 * badge and its alerts come from prepared data, never the live DOM.
 */

import type { MapBounds, MapPoint } from "../app/map-geometry.ts";
import type { MapOverlapIndicatorSize } from "./map-overlap-badges.ts";
import type { ConnectorOutline } from "./overlap-badge-connector.ts";
import {
  placeOverlapChooser,
  type OverlapChooserPreferredBox,
} from "./overlap-chooser-placement.ts";
import { affectedOutlinesOnScreen } from "./map-overlays/overlap-badge-layout.ts";

export type SvgBounds = MapBounds;
export type OverlapBadgeSize = MapOverlapIndicatorSize;

/** TTC's authored view box and its scale onto the 4500 px stage. */
export const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
export const MAP_SVG_TO_CSS_SCALE = 4500 / MAP_VIEWBOX_BOUNDS.width;

/**
 * Where a map's overlay coordinates land on its stage, in stage CSS pixels:
 * `stage = point × scale + offset`. The camera then moves the stage.
 */
export type MapStageTransform = { scale: number; x: number; y: number };

/** The stage transform of an SVG plane that fills a `width × height` stage with `xMidYMid meet`. */
export function meetStageTransform(viewBox: SvgBounds, width: number, height: number): MapStageTransform {
  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  return {
    scale,
    x: (width - viewBox.width * scale) / 2 - viewBox.x * scale,
    y: (height - viewBox.height * scale) / 2 - viewBox.y * scale,
  };
}
export {
  overlapChooserSize,
  OVERLAP_CHOOSER_WIDTH,
  OVERLAP_CHOOSER_MOBILE_BREAKPOINT,
  OVERLAP_CHOOSER_MOBILE_WIDTH,
} from "./map-chooser-layout.ts";

export type OverlapChooserScreenBadgeTarget = {
  position: MapPoint;
  size: OverlapBadgeSize;
  chooserSize: OverlapBadgeSize;
  /** The visible overlays of the alerts in the chooser, in map coordinates. */
  affectedOutlines: ConnectorOutline[];
};

export type OverlapChooserScreenLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
  /** True when the card had to cover part of the highlighted overlays. */
  coversAffectedArea: boolean;
  /** The badge centre the card was placed for, in viewport pixels. */
  badgeCenter: MapPoint;
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

export function overlapChooserScreenLayout(
  badge: OverlapChooserScreenBadgeTarget,
  mapTransform: { x: number; y: number; scale: number },
  stage: MapStageTransform,
  viewportSize: { width: number; height: number },
  screenKeepoutBoxes: SvgBounds[] = [],
  preferred: OverlapChooserPreferredBox | null = null,
): OverlapChooserScreenLayout {
  const scale = mapTransform.scale * stage.scale;
  const toScreen = (point: MapPoint): MapPoint => ({
    x: mapTransform.x + (point.x * stage.scale + stage.x) * mapTransform.scale,
    y: mapTransform.y + (point.y * stage.scale + stage.y) * mapTransform.scale,
  });
  const badgeCenter = toScreen(badge.position);
  const affectedArea = affectedOutlinesOnScreen(badge.affectedOutlines, toScreen, scale);
  const placement = placeOverlapChooser({
    viewportSize,
    badgeBox: {
      x: badgeCenter.x - (badge.size.width * scale) / 2,
      y: badgeCenter.y - (badge.size.height * scale) / 2,
      width: badge.size.width * scale,
      height: badge.size.height * scale,
    },
    affectedArea,
    keepouts: screenKeepoutBoxes,
    requestedSize: badge.chooserSize,
    preferred,
  });
  return {
    left: placement.left,
    top: placement.top,
    width: placement.width,
    height: placement.height,
    anchorOffsetX: placement.anchorOffsetX,
    anchorOffsetY: placement.anchorOffsetY,
    coversAffectedArea: placement.coversAffectedArea,
    badgeCenter,
  };
}

/** The card's box relative to its badge, to keep it in place across a settled camera move. */
export function overlapChooserPreferredBox(layout: OverlapChooserScreenLayout): OverlapChooserPreferredBox {
  return {
    offsetX: layout.left - layout.badgeCenter.x,
    offsetY: layout.top - layout.badgeCenter.y,
    width: layout.width,
    height: layout.height,
    coversAffectedArea: layout.coversAffectedArea,
  };
}

/** True when two layouts draw the card in the same place for the same badge. */
export function overlapChooserScreenLayoutsMatch(
  first: OverlapChooserScreenLayout,
  second: OverlapChooserScreenLayout,
): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return near(first.left, second.left)
    && near(first.top, second.top)
    && near(first.width, second.width)
    && near(first.height, second.height)
    && near(first.badgeCenter.x, second.badgeCenter.x)
    && near(first.badgeCenter.y, second.badgeCenter.y)
    && first.coversAffectedArea === second.coversAffectedArea;
}
