const SECTION_HIGHLIGHT_CLASS = "station-impact-card-highlight-soft";
const SECTION_HIGHLIGHT_MS = 1800;
const highlightTimers = new WeakMap<HTMLElement, number>();

/**
 * Scrolls the station panel body to its Station Impacts section and briefly
 * outlines every impact card, since the summary banner stands for all of them.
 */
export function jumpToStationImpactsSection(origin: HTMLElement, reducedMotion?: boolean) {
  const scroller = origin.closest<HTMLElement>(".station-detail-scroll");
  const section = scroller?.querySelector<HTMLDetailsElement>('[data-station-section="station-impacts"]');
  if (!scroller || !section) return;

  section.open = true;
  const cards = [...section.querySelectorAll<HTMLElement>(".station-impact-card")];
  if (cards.some((card) => card.classList.contains(SECTION_HIGHLIGHT_CLASS))) {
    for (const card of cards) card.classList.remove(SECTION_HIGHLIGHT_CLASS);
    void section.offsetWidth;
  }
  for (const card of cards) {
    card.classList.add(SECTION_HIGHLIGHT_CLASS);
  }

  // Scroll only the panel body, leaving its header and section controls fixed.
  const top = scroller.scrollTop
    + section.getBoundingClientRect().top
    - scroller.getBoundingClientRect().top
    - scroller.clientTop
    - 8;
  scroller.scrollTo({
    top: Math.max(0, top),
    behavior: reducedMotion ? "instant" : "smooth",
  });

  const existingTimer = highlightTimers.get(section);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }
  highlightTimers.set(
    section,
    window.setTimeout(() => {
      highlightTimers.delete(section);
      for (const card of cards) card.classList.remove(SECTION_HIGHLIGHT_CLASS);
    }, SECTION_HIGHLIGHT_MS),
  );
}
