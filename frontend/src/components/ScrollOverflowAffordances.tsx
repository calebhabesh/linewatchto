"use client";

import { useEffect } from "react";

const SCROLL_LIST_SELECTOR = [
  "#linewatch-main-menu-scroll",
  ".mobile-app-chip-scroll",
  ".line-impact-panel-stack",
  ".alert-stack",
  ".closure-stack",
  ".commute-grid",
  ".saved-commute-list-scroll",
  ".reliability-list",
  ".health-grid",
  ".my-stations-list",
  ".overlap-chooser-list",
  ".station-search-results",
  ".station-search-lines-column",
  ".station-search-stations-column",
  ".commute-station-options",
  ".commute-station-lines-column",
  ".commute-station-stations-scroll",
  ".commute-route-stop-list",
  ".notification-settings-scroll",
  ".accessibility-outages-scroll",
  ".surface-notices-scroll",
  ".station-detail-scroll",
  ".release-notes-content",
  ".privacy-acknowledgements-scroll",
  ".mobile-status-content-scroll",
  ".mobile-more-content-scroll",
  ".mobile-impact-inspector-scroll",
  ".site-guide-body",
  ".push-devices-list",
  ".push-diagnostics-scroll",
  ".alert-history-line-filter-options",
  ".alert-history-scroll",
  ".saved-commute-sort-options",
  ".impact-list-select-options",
  ".opening-disclaimer-panel",
  ".mobile-legend-line-list",
  ".logs-dropdown-scroll",
  ".feedback-content",
  ".subway-closed-content",
  ".mobile-service-sheet-details",
].join(",");

const MORE_BELOW_ATTRIBUTE = "data-scroll-more-below";

function updateOverflowAffordance(element: HTMLElement) {
  if (element.matches(".mobile-app-chip-scroll")) {
    element.toggleAttribute("data-scroll-more-right", element.clientWidth > 0
      && element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
    return;
  }
  const hasVisibleViewport = element.clientHeight > 0;
  const hasMoreBelow = hasVisibleViewport
    && element.scrollHeight > element.clientHeight + 2
    && element.scrollTop + element.clientHeight < element.scrollHeight - 2;

  element.toggleAttribute(MORE_BELOW_ATTRIBUTE, hasMoreBelow);
}

export function ScrollOverflowAffordances() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".linewatch-shell");
    if (!shell) return;

    const trackedElements = new Set<HTMLElement>();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
        entries.forEach((entry) => updateOverflowAffordance(entry.target as HTMLElement));
      });

    const registerElement = (element: HTMLElement) => {
      if (trackedElements.has(element)) return;
      trackedElements.add(element);
      resizeObserver?.observe(element);
      updateOverflowAffordance(element);
    };
    const unregisterElement = (element: HTMLElement) => {
      if (!trackedElements.delete(element)) return;
      resizeObserver?.unobserve(element);
      element.removeAttribute(MORE_BELOW_ATTRIBUTE);
      element.removeAttribute("data-scroll-more-right");
    };

    const visitListsWithin = (root: ParentNode, visitor: (element: HTMLElement) => void) => {
      if (root instanceof HTMLElement && root.matches(SCROLL_LIST_SELECTOR)) {
        visitor(root);
      }
      root.querySelectorAll<HTMLElement>(SCROLL_LIST_SELECTOR).forEach(visitor);
    };

    const handleScroll = (event: Event) => {
      if (event.target instanceof HTMLElement && trackedElements.has(event.target)) {
        updateOverflowAffordance(event.target);
      }
    };
    const handleResize = () => trackedElements.forEach(updateOverflowAffordance);
    let pendingAnimationFrame: number | null = null;
    const scheduleUpdate = () => {
      if (pendingAnimationFrame !== null) return;
      pendingAnimationFrame = window.requestAnimationFrame(() => {
        pendingAnimationFrame = null;
        handleResize();
      });
    };
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) visitListsWithin(node, registerElement);
          });
          mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement) visitListsWithin(node, unregisterElement);
          });
          const target = mutation.target;
          if (target instanceof HTMLElement) {
            const owningList = target.matches(SCROLL_LIST_SELECTOR)
              ? target
              : target.closest<HTMLElement>(SCROLL_LIST_SELECTOR);
            if (owningList && trackedElements.has(owningList)) {
              updateOverflowAffordance(owningList);
            }
          }
        } else if (mutation.type === "attributes") {
          if (
            mutation.attributeName !== MORE_BELOW_ATTRIBUTE &&
            mutation.attributeName !== "data-scroll-more-right"
          ) {
            const target = mutation.target;
            if (target instanceof HTMLElement) {
              const owningList = target.matches(SCROLL_LIST_SELECTOR)
                ? target
                : target.closest<HTMLElement>(SCROLL_LIST_SELECTOR);
              if (owningList && trackedElements.has(owningList)) {
                updateOverflowAffordance(owningList);
              }
            }
          }
        }
      });
    });

    visitListsWithin(shell, registerElement);
    shell.addEventListener("scroll", handleScroll, true);
    shell.addEventListener("animationend", scheduleUpdate, true);
    shell.addEventListener("transitionend", scheduleUpdate, true);
    window.addEventListener("resize", handleResize);
    mutationObserver.observe(shell, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-expanded", "data-expanded", "data-nav-direction", "open"],
    });

    return () => {
      shell.removeEventListener("scroll", handleScroll, true);
      shell.removeEventListener("animationend", scheduleUpdate, true);
      shell.removeEventListener("transitionend", scheduleUpdate, true);
      window.removeEventListener("resize", handleResize);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (pendingAnimationFrame !== null) window.cancelAnimationFrame(pendingAnimationFrame);
      trackedElements.forEach((element) => {
        element.removeAttribute(MORE_BELOW_ATTRIBUTE);
        element.removeAttribute("data-scroll-more-right");
      });
    };
  }, []);

  return null;
}
