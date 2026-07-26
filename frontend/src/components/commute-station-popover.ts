export type PopoverRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
};

export type VisualViewportBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type CommuteStationPopoverCoords = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
};

type PopoverGeometryOptions = {
  trigger: PopoverRect;
  viewport: VisualViewportBounds;
  container?: PopoverRect | null;
  mobile: boolean;
  expanded: boolean;
  mobileSearchActive: boolean;
};

const MAX_POPOVER_HEIGHT = 320;
const MOBILE_ACTIVE_BOTTOM_INSET = 16;

export function calculateMobilePickerAlignmentScroll(
  pickerTop: number,
  scrollAreaTop: number,
  topInset = 8,
) {
  return pickerTop - scrollAreaTop - topInset;
}

export function isVisualKeyboardOpen(
  viewport: VisualViewportBounds,
  layoutViewportHeight: number,
) {
  const keyboardInset = Math.max(0, layoutViewportHeight - viewport.height - viewport.top);
  return keyboardInset > 120 || viewport.height < layoutViewportHeight * 0.78;
}

export function calculateCommuteStationPopoverCoords({
  trigger,
  viewport,
  container,
  mobile,
  expanded,
  mobileSearchActive,
}: PopoverGeometryOptions): CommuteStationPopoverCoords {
  const edgeInset = mobile ? 8 : 16;
  const gap = 6;
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  let left = trigger.left;
  let width = trigger.width + (!mobile && expanded ? 340 : 0);

  if (mobile) {
    const leftLimit = Math.max(viewport.left + edgeInset, (container?.left ?? viewport.left) + edgeInset);
    const rightLimit = Math.min(viewportRight - edgeInset, (container?.right ?? viewportRight) - edgeInset);
    const availableWidth = Math.max(0, rightLimit - leftLimit);
    width = Math.min(width, availableWidth);
    left = Math.min(Math.max(left, leftLimit), rightLimit - width);
  } else {
    if (left + width > viewportRight - edgeInset) {
      left = viewportRight - width - edgeInset;
    }
    left = Math.max(left, viewport.left + edgeInset);
  }

  // The parent commute sheet moves to the top of the visual viewport while its
  // search is active. Keep the menu attached to its trigger after that move and
  // use the remaining visual viewport only as an overflow boundary. This avoids
  // both iOS compression and Android's detached, fixed-height overlay effect.
  if (mobile) {
    const top = trigger.bottom + gap;
    const viewportLimit = mobileSearchActive
      ? viewportBottom - MOBILE_ACTIVE_BOTTOM_INSET
      : viewportBottom - edgeInset;
    const containerLimit = (container?.bottom ?? viewportBottom) - edgeInset;
    // Active mobile search gives the My Commutes sheet this same stable
    // visual-viewport boundary in CSS. Do not re-read its animated bottom on
    // iOS; the transient measurement is what previously collapsed the menu.
    const visibleBottom = mobileSearchActive
      ? viewportLimit
      : Math.min(viewportLimit, containerLimit);
    return {
      top,
      left,
      width,
      maxHeight: Math.max(0, Math.min(MAX_POPOVER_HEIGHT, visibleBottom - top)),
      placement: "below",
    };
  }

  const belowTop = trigger.bottom + gap;
  const belowSpace = viewportBottom - belowTop - edgeInset;
  const aboveSpace = trigger.top - viewport.top - gap - edgeInset;

  const minUsableHeight = 100;
  const placeBelow = belowSpace >= minUsableHeight || belowSpace >= aboveSpace;
  const availableHeight = placeBelow ? belowSpace : aboveSpace;
  const maxHeight = Math.max(120, Math.min(MAX_POPOVER_HEIGHT, availableHeight));

  return {
    top: placeBelow
      ? belowTop
      : undefined,
    bottom: !placeBelow ? viewportBottom - trigger.top + gap : undefined,
    left,
    width,
    maxHeight,
    placement: placeBelow ? "below" : "above",
  };
}
