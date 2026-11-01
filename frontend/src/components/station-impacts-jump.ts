const SECTION_HIGHLIGHT_CLASS = "station-impact-card-highlight-soft";
const SECTION_HIGHLIGHT_MS = 1650;
const SCROLL_SETTLE_FALLBACK_MS = 550;
const activeHighlightCleanups = new WeakMap<HTMLElement, () => void>();

/**
 * Scrolls the station panel body to its Station Impacts section and briefly
 * outlines every impact card once the scroll arrives, since the summary banner
 * stands for all of them.
 */
export function jumpToStationImpactsSection(origin: HTMLElement, reducedMotion?: boolean) {
  const scroller = origin.closest<HTMLElement>(".station-detail-scroll");
  const section = scroller?.querySelector<HTMLDetailsElement>('[data-station-section="station-impacts"]');
  if (!scroller || !section) return;

  activeHighlightCleanups.get(section)?.();

  if (!section.open) {
    section.open = true;
  }

  const cards = [...section.querySelectorAll<HTMLElement>(".station-impact-card")];
  for (const card of cards) {
    card.classList.remove(SECTION_HIGHLIGHT_CLASS);
  }

  // Scroll only the panel body, leaving its header and section controls fixed.
  const rawTop = scroller.scrollTop
    + section.getBoundingClientRect().top
    - scroller.getBoundingClientRect().top
    - scroller.clientTop
    - 8;
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const targetTop = Math.max(0, Math.min(rawTop, maxScrollTop));
  const willSmoothScroll = !reducedMotion && Math.abs(scroller.scrollTop - targetTop) >= 2;

  scroller.scrollTo({
    top: targetTop,
    behavior: reducedMotion ? "instant" : "smooth",
  });

  let settleTimer: number | undefined;
  let clearHighlightTimer: number | undefined;
  let started = false;

  const startHighlight = () => {
    if (started) return;
    started = true;
    scroller.removeEventListener("scrollend", startHighlight);
    if (settleTimer !== undefined) {
      window.clearTimeout(settleTimer);
      settleTimer = undefined;
    }
    for (const card of cards) {
      card.classList.add(SECTION_HIGHLIGHT_CLASS);
    }
    clearHighlightTimer = window.setTimeout(() => {
      activeHighlightCleanups.delete(section);
      for (const card of cards) {
        card.classList.remove(SECTION_HIGHLIGHT_CLASS);
      }
    }, SECTION_HIGHLIGHT_MS);
  };

  const cleanup = () => {
    scroller.removeEventListener("scrollend", startHighlight);
    if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    if (clearHighlightTimer !== undefined) window.clearTimeout(clearHighlightTimer);
    for (const card of cards) {
      card.classList.remove(SECTION_HIGHLIGHT_CLASS);
    }
    activeHighlightCleanups.delete(section);
  };

  activeHighlightCleanups.set(section, cleanup);

  if (willSmoothScroll) {
    scroller.addEventListener("scrollend", startHighlight, { once: true });
    settleTimer = window.setTimeout(startHighlight, SCROLL_SETTLE_FALLBACK_MS);
  } else {
    startHighlight();
  }
}
