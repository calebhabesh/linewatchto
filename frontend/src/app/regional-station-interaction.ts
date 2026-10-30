/*
 * GO/UP station selection and station-label hover. Its station targets and
 * selection indicators are part of the injected SVG (prepareRegionalMapMarkup),
 * not React elements as on TTC, so their state is written to them here.
 */

/**
 * Marks the selected station's target and selection indicator, and whether
 * its selection intro has finished (`selection-intro-complete`, as the
 * shared overlays do from `useMapSelectionIntro`).
 */
export function applyRegionalStationSelection(
  root: ParentNode,
  selectedStationId: string | null,
  introComplete: boolean,
) {
  root.querySelectorAll<SVGElement>("[data-regional-station-selected]").forEach((element) => {
    element.removeAttribute("data-regional-station-selected");
    element.classList.remove("selection-intro-complete");
  });
  if (!selectedStationId) return;
  const id = CSS.escape(selectedStationId);
  const selected = [
    root.querySelector<SVGElement>(`[data-regional-station-id="${id}"]`),
    root.querySelector<SVGElement>(`[data-regional-station-selection-id="${id}"]`),
  ];
  for (const element of selected) {
    element?.setAttribute("data-regional-station-selected", "true");
    element?.classList.toggle("selection-intro-complete", introComplete);
  }
}

/**
 * Reports the station whose dot or name the mouse is over, or that has
 * keyboard focus on fine-pointer devices. TTC does the same with React
 * handlers on its station targets. Returns a cleanup.
 */
export function installRegionalStationLabelHover(
  viewport: HTMLElement,
  {
    onHoverStationId,
    isPointerGestureActive,
  }: {
    onHoverStationId: (stationId: string | null) => void;
    isPointerGestureActive: () => boolean;
  },
): () => void {
  const stationIdOf = (target: EventTarget | null) => (
    target instanceof Element
      ? target.closest<SVGElement>("[data-regional-station-id]")?.dataset.regionalStationId ?? null
      : null
  );
  const handlePointerMove = (event: PointerEvent) => {
    if (isPointerGestureActive() || event.pointerType !== "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    const onMap = target && viewport.contains(target) && !target.closest(".overlap-indicator");
    onHoverStationId(onMap ? stationIdOf(target) : null);
  };
  const handleFocusIn = (event: FocusEvent) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const stationId = stationIdOf(event.target);
    if (stationId) onHoverStationId(stationId);
  };
  const handleFocusOut = (event: FocusEvent) => {
    const next = stationIdOf(event.relatedTarget);
    if (stationIdOf(event.target) !== next) onHoverStationId(next);
  };
  const documentNode = viewport.ownerDocument;
  documentNode.addEventListener("pointermove", handlePointerMove);
  documentNode.addEventListener("focusin", handleFocusIn);
  documentNode.addEventListener("focusout", handleFocusOut);
  return () => {
    documentNode.removeEventListener("pointermove", handlePointerMove);
    documentNode.removeEventListener("focusin", handleFocusIn);
    documentNode.removeEventListener("focusout", handleFocusOut);
  };
}
