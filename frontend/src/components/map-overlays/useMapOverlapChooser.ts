/**
 * Places an open overlap chooser on every System Map, from prepared data:
 * the badge's map position and its alerts' outlines go through the map's
 * stage transform and the committed camera, never the live DOM.
 *
 * The card is solved only at a committed camera. During a drag or a camera
 * flight the follower keeps the shown card on its badge. When the camera
 * settles, the card keeps its spot beside the badge while that spot is still
 * valid, and otherwise glides to a fresh one. A badge panned off screen keeps
 * its card attached rather than pinning it to an edge.
 */
import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { MapPoint } from "../../app/map-geometry";
import type { MapViewportOrientation, PanZoomTransform } from "../../hooks/panZoomMath";
import { clientRectToLogicalViewportBounds } from "../../hooks/panZoomMath";
import { useCommittedCamera, type MapCameraStore } from "../map-camera/camera-store";
import { chooserBadgeInView, type ChooserFollowAnchor } from "../map-chooser-follow";
import { observeMapChooserKeepouts, visibleMapChooserKeepouts } from "../map-chooser-keepouts";
import {
  boundsListsMatch,
  overlapChooserPreferredBox,
  overlapChooserScreenLayout,
  overlapChooserScreenLayoutsMatch,
  overlapChooserSize,
  type MapStageTransform,
  type OverlapBadgeSize,
  type OverlapChooserScreenLayout,
  type SvgBounds,
} from "../map-chooser-placement";
import type { ConnectorOutline } from "../overlap-badge-connector";

/** An open overlap badge, in its map's overlay coordinates. */
export type MapChooserBadge = {
  id: string;
  position: MapPoint;
  size: OverlapBadgeSize;
  impactCount: number;
  /** The visible overlays of the badge's alerts; the card keeps them uncovered. */
  affectedOutlines: ConnectorOutline[];
};

export type MapOverlapChooserPlacement = {
  badgeId: string;
  layout: OverlapChooserScreenLayout;
  followAnchor: ChooserFollowAnchor;
  badgeInView: boolean;
};

/** The map's logical viewport size, kept current as it resizes or rotates. */
export function useMapViewportSize(
  viewportRef: RefObject<HTMLElement | null>,
  orientation: MapViewportOrientation,
) {
  const [size, setSize] = useState({ width: 392, height: 720 });
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const width = orientation === "rotated-landscape" ? viewport.clientHeight : viewport.clientWidth;
      const height = orientation === "rotated-landscape" ? viewport.clientWidth : viewport.clientHeight;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [orientation, viewportRef]);
  return size;
}

export function useMapOverlapChooser({
  badge,
  stage,
  cameraStore,
  readCamera,
  isCameraInteracting,
  viewportRef,
  viewportSize,
  viewportOrientation,
}: {
  badge: MapChooserBadge | null;
  stage: MapStageTransform;
  cameraStore: MapCameraStore;
  readCamera: () => PanZoomTransform;
  isCameraInteracting: () => boolean;
  viewportRef: RefObject<HTMLElement | null>;
  viewportSize: { width: number; height: number };
  viewportOrientation: MapViewportOrientation;
}): MapOverlapChooserPlacement | null {
  // Panels and controls over the map, in logical viewport pixels.
  const [keepouts, setKeepouts] = useState<SvgBounds[]>([]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const boxes = visibleMapChooserKeepouts()
        .map((element) => clientRectToLogicalViewportBounds(
          element.getBoundingClientRect(),
          viewportRect,
          viewportOrientation,
        ))
        .filter((box): box is SvgBounds => Boolean(box));
      setKeepouts((current) => (boundsListsMatch(current, boxes) ? current : boxes));
    };
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);
    const stopObserving = observeMapChooserKeepouts(update);
    update();
    return () => {
      stopObserving();
      resizeObserver.disconnect();
    };
  }, [badge?.id, viewportOrientation, viewportRef, viewportSize.width]);

  // Camera commits re-render the map only while a chooser is open.
  const committedCamera = useCommittedCamera(cameraStore, badge !== null);
  const [shown, setShown] = useState<MapOverlapChooserPlacement | null>(null);
  const shownBadgeId = shown?.badgeId;
  const preferredBox = useMemo(
    () => (shown ? overlapChooserPreferredBox(shown.layout) : null),
    [shown],
  );
  const solved = useMemo((): MapOverlapChooserPlacement | null => {
    if (!badge) return null;
    const camera = committedCamera ?? readCamera();
    const layout = overlapChooserScreenLayout(
      {
        position: badge.position,
        size: badge.size,
        chooserSize: overlapChooserSize(badge.impactCount, viewportSize.width),
        affectedOutlines: badge.affectedOutlines,
      },
      camera,
      stage,
      viewportSize,
      keepouts,
      shownBadgeId === badge.id ? preferredBox : null,
    );
    return {
      badgeId: badge.id,
      layout,
      followAnchor: { badge: layout.badgeCenter, camera },
      badgeInView: chooserBadgeInView(layout.badgeCenter, viewportSize),
    };
  }, [badge, committedCamera, keepouts, preferredBox, readCamera, shownBadgeId, stage, viewportSize]);

  if (!solved) {
    if (shown !== null) setShown(null);
    return null;
  }
  const changed = solved.badgeId !== shown?.badgeId
    || (
      shown !== null
      && !overlapChooserScreenLayoutsMatch(solved.layout, shown.layout)
      && !isCameraInteracting()
      && solved.badgeInView
    );
  if (changed) {
    setShown(solved);
    return solved;
  }
  return shown;
}
