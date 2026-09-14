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
    mutationObserver = new MutationObserver(() => {
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
/** Station center in the rendered SVG viewport, before the map camera transform. */
export function readMapStationCenterX(viewport: HTMLElement | null, stationId: string) {
  const station = viewport?.querySelector<SVGGraphicsElement>(`svg #station-${stationId}`);
  const matrix = station?.getCTM();
  if (!station || !matrix) return null;
  const bounds = station.getBBox();
  return new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    .matrixTransform(matrix).x;
}
