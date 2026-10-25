const SECTION_HIGHLIGHT_CLASS = "station-impact-card-highlight-soft";
const SECTION_HIGHLIGHT_MS = 1800;

/**
 * Scrolls the station panel body to its Station Impacts section and briefly
 * outlines every impact card, since the summary banner stands for all of them.
 */
export function jumpToStationImpactsSection(origin: HTMLElement, reducedMotion?: boolean) {
  const scroller = origin.closest<HTMLElement>(".station-detail-scroll");
  const section = scroller?.querySelector<HTMLDetailsElement>('[data-station-section="station-impacts"]');
  if (!scroller || !section) return;

  section.open = true;
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

  const cards = [...section.querySelectorAll<HTMLElement>(".station-impact-card")];
  for (const card of cards) {
    card.classList.remove(SECTION_HIGHLIGHT_CLASS);
    void card.offsetWidth;
    card.classList.add(SECTION_HIGHLIGHT_CLASS);
  }
  window.setTimeout(() => {
    for (const card of cards) card.classList.remove(SECTION_HIGHLIGHT_CLASS);
  }, SECTION_HIGHLIGHT_MS);
}
