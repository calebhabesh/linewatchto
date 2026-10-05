import { readStoredSheetHeightRatio } from "./useMobileDraggableSheet.ts";

const lastKnownMobileInsetsByShell = new WeakMap<object, Map<string, { top: number; bottom: number }>>();

function getCachedInsets(shell: Element): { top: number; bottom: number } | null {
  const network = shell.getAttribute?.("data-network") || "ttc";
  return lastKnownMobileInsetsByShell.get(shell)?.get(network) ?? null;
}

function setCachedInsets(shell: Element, insets: { top: number; bottom: number }) {
  const network = shell.getAttribute?.("data-network") || "ttc";
  let map = lastKnownMobileInsetsByShell.get(shell);
  if (!map) {
    map = new Map();
    lastKnownMobileInsetsByShell.set(shell, map);
  }
  map.set(network, insets);
}

export function observeMobileMapFrame(viewport: HTMLElement | null, onResize: () => void) {
  const shell = viewport?.closest(".linewatch-shell");
  if (!shell) return () => {};

  const checkInsetsAndResize = () => {
    if (shell.getAttribute("data-active-view") !== "map") return;
    if (shell.querySelector(".mobile-app-topbar[data-searching='true']")) return;

    const lastInsets = getCachedInsets(shell);
    const insets = readMobileMapFrameInsets(viewport);
    if (!insets) return;

    if (
      lastInsets &&
      Math.abs(insets.top - lastInsets.top) < 1 &&
      Math.abs(insets.bottom - lastInsets.bottom) < 1
    ) {
      return;
    }

    onResize();
  };

  const observer = new ResizeObserver((entries) => {
    const anyPositive = entries.some(
      (entry) => entry.contentRect.height > 0
        || ((entry.target as HTMLElement).offsetHeight > 0),
    );
    if (!anyPositive) return;

    checkInsetsAndResize();
  });

  const observeElements = () => {
    for (const element of shell.querySelectorAll(".mobile-app-chip-scroll, .mobile-service-sheet-minimum")) {
      observer.observe(element);
    }
  };

  observeElements();

  let mutationObserver: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined") {
    const isFrameElement = (node: Node): boolean => {
      if (!(node instanceof HTMLElement)) return false;
      return Boolean(
        node.matches(".mobile-app-chip-scroll, .mobile-service-sheet, .mobile-service-sheet-minimum") ||
        node.querySelector(".mobile-app-chip-scroll, .mobile-service-sheet, .mobile-service-sheet-minimum")
      );
    };

    mutationObserver = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(isFrameElement) ||
        Array.from(mutation.removedNodes).some(isFrameElement)
      );
      if (!hasRelevantChange) return;

      observeElements();
      checkInsetsAndResize();
    });
    mutationObserver.observe(shell, { childList: true, subtree: true });
  }

  return () => {
    observer.disconnect();
    mutationObserver?.disconnect();
  };
}

export function readMobileMapFrameInsets(viewport: HTMLElement | null) {
  if (!viewport || typeof window === "undefined" || window.innerWidth >= 768) return null;
  const shell = viewport.closest?.(".linewatch-shell");
  if (!shell) return null;

  // Inspectors have their own viewport framing (impact details shrink main).
  // Overview insets cached for search would reserve the sheet space twice here.
  // Keep the cache intact so closing search can still preserve the overview.
  if (shell.classList?.contains("mobile-map-inspector")) return null;

  const chips = shell.querySelector<HTMLElement>(".mobile-app-chip-scroll");
  const sheet = shell.querySelector<HTMLElement>(".mobile-service-sheet");
  const minimum = sheet?.querySelector<HTMLElement>(".mobile-service-sheet-minimum");

  if (chips && sheet && minimum) {
    const chipsRect = chips.getBoundingClientRect?.();
    const minRect = minimum.getBoundingClientRect?.();
    const chipsValid = chipsRect && chipsRect.height !== 0;
    const minValid = minRect && minRect.height !== 0;
    if (chipsValid && minValid) {
      const rect = viewport.getBoundingClientRect();
      const sheetStyle = window.getComputedStyle(sheet);
      // CSS bottom is unaffected by the translated sheet or the user's chosen snap.
      const sheetBottom = Number.parseFloat(sheetStyle.bottom) || 0;
      const overviewTop = window.innerHeight - sheetBottom - (minRect.height ?? 0);
      const insets = {
        top: Math.max(0, (chipsRect.bottom ?? 0) - rect.top),
        bottom: Math.max(0, rect.bottom - overviewTop),
      };
      setCachedInsets(shell, insets);
      return insets;
    }
  }

  return getCachedInsets(shell);
}

export function readMobileImpactInspectorInset(viewport: HTMLElement | null) {
  const shell = viewport?.closest<HTMLElement>(".linewatch-shell.mobile-map-inspector-impact");
  const inspector = shell?.querySelector<HTMLElement>(".mobile-impact-inspector");
  return inspector?.getBoundingClientRect().height ?? 0;
}

/** Station center in the rendered SVG viewport, before the map camera transform. */
export function readMapStationCenterX(viewport: HTMLElement | null, stationId: string) {
  const station = viewport?.querySelector<SVGGraphicsElement>(`svg #station-${stationId}`);
  const matrix = station?.getCTM();
  if (!station || !matrix) return null;
  const bounds = station.getBBox();
  return new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    .matrixTransform(matrix).x;
}

/**
 * Bottom boundary of the pill entries below the search bar in the mobile topbar.
 * Returns the distance from the top of the viewport container to the bottom of the pill entries.
 */
export function readMobilePillBottom(viewport: HTMLElement | null): number {
  if (!viewport || typeof window === "undefined") return 0;
  const shell = viewport.closest?.(".linewatch-shell") ?? document.querySelector(".linewatch-shell");
  const chips = shell?.querySelector<HTMLElement>(".mobile-app-chip-scroll");
  if (chips) {
    const chipsRect = chips.getBoundingClientRect?.();
    if (chipsRect && chipsRect.bottom > 0) {
      const viewportRect = viewport.getBoundingClientRect();
      return Math.max(0, chipsRect.bottom - viewportRect.top);
    }
  }
  const topbar = shell?.querySelector<HTMLElement>(".mobile-app-topbar");
  if (topbar) {
    const topbarRect = topbar.getBoundingClientRect?.();
    if (topbarRect && topbarRect.bottom > 0) {
      const viewportRect = viewport.getBoundingClientRect();
      return Math.max(0, topbarRect.bottom - viewportRect.top);
    }
  }
  return 0;
}

/**
 * Top boundary of the station submenu sheet on mobile.
 * Returns the distance from the top of the viewport container to the top of the station submenu.
 */
export function readMobileStationSubmenuTop(
  viewport: HTMLElement | null,
  fallbackViewportHeight: number,
): number {
  if (!viewport || typeof window === "undefined") {
    const storedRatio = readStoredSheetHeightRatio(null);
    return fallbackViewportHeight * (1 - storedRatio);
  }
  const shell = viewport.closest?.(".linewatch-shell") ?? document.querySelector(".linewatch-shell");
  const panel = shell?.querySelector<HTMLElement>(".station-detail-panel");
  if (panel) {
    const panelRect = panel.getBoundingClientRect?.();
    if (panelRect && panelRect.top > 0) {
      const viewportRect = viewport.getBoundingClientRect();
      return Math.max(0, panelRect.top - viewportRect.top);
    }
  }
  const storedRatio = readStoredSheetHeightRatio(window.localStorage);
  return fallbackViewportHeight * (1 - storedRatio);
}

/**
 * Top boundary of the mobile impact/alert inspector overlay.
 * Returns the distance from the top of the viewport container to the top of the inspector.
 */
export function readMobileImpactInspectorTop(
  viewport: HTMLElement | null,
  fallbackViewportHeight: number,
): number {
  if (!viewport || typeof window === "undefined") return fallbackViewportHeight;
  const shell = viewport.closest?.(".linewatch-shell.mobile-map-inspector-impact") ?? document.querySelector(".linewatch-shell.mobile-map-inspector-impact");
  const inspector = shell?.querySelector<HTMLElement>(".mobile-impact-inspector");
  if (inspector) {
    const inspectorRect = inspector.getBoundingClientRect?.();
    if (inspectorRect && inspectorRect.height > 0) {
      // The inspector is anchored to the bottom. Its entrance translation moves
      // rect.top, but the camera must reserve its final height from the start.
      return Math.max(0, fallbackViewportHeight - inspectorRect.height);
    }
  }
  const inspectorInset = readMobileImpactInspectorInset(viewport);
  if (inspectorInset > 0) {
    return Math.max(0, fallbackViewportHeight - inspectorInset);
  }
  return fallbackViewportHeight;
}

/** Reserve the route-preview banner so the destination stays above it. */
export function readCommutePreviewInset(viewport: HTMLElement | null): number {
  if (!viewport || typeof window === "undefined") return 0;
  const shell = viewport.closest(".linewatch-shell");
  const banner = shell?.querySelector<HTMLElement>(".commute-path-preview-chip:not(.commute-path-preview-embedded), .geographic-commute-preview-banner");
  if (!banner || banner.getClientRects().length === 0) return 0;
  return Math.max(0, viewport.getBoundingClientRect().bottom - banner.getBoundingClientRect().top + 16);
}
