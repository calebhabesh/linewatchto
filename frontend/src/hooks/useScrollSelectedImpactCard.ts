"use client";

import { useEffect } from "react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { MOBILE_VIEWPORT_QUERY } from "./useMobilePerformanceMode";
import { whenMapSelectionIntroStarts } from "../app/selection-intro-sync";

// Shared across panels: the badge that swaps between a planned advisory and its
// current impact moves the selection to another panel, and the outgoing and
// incoming panels can both be mounted during the view transition. Every panel
// reuses the decision made for the same selection object.
let pendingSkipGlow: NonNullable<ImpactSelection> | null = null;
let lastSelectionGlow: { selection: NonNullable<ImpactSelection>; skipGlow: boolean } | null = null;

/** Call before selecting from an in-card badge: the card swaps in place, so it should not glow. */
export function skipNextImpactCardGlow(selection: NonNullable<ImpactSelection>) {
  pendingSkipGlow = selection;
}

export function useScrollSelectedImpactCard(
  selection: ImpactSelection,
  kind: ImpactKind,
) {
  useEffect(() => {
    if (!selection) {
      lastSelectionGlow = null;
      return;
    }
    const isMatch = selection.kind === kind ||
      (kind === "suspension" && selection.kind === "planned-closure");
    if (!isMatch) return;

    let highlightTimeout: number | undefined;
    let cancelIntroWait: (() => void) | undefined;

    const selectedCard = () => document.querySelector<HTMLElement>(
      `[data-impact-card-id="${CSS.escape(selection.id)}"]`,
    );

    // The glow pulses with the map's flash when the map flashes this
    // selection: its animation takes the flash's start time, so both run on
    // one clock however late this runs.
    const highlightCard = (flashStartTime: number | null) => {
      const card = selectedCard();
      if (!card) return;

      card.classList.remove("highlight-active-card");
      void card.offsetWidth;
      card.classList.add("highlight-active-card");
      let elapsedMs = 0;
      if (flashStartTime !== null && typeof card.getAnimations === "function") {
        const now = document.timeline?.currentTime;
        const glow = card.getAnimations({ subtree: true }).find((animation) => (
          (animation as CSSAnimation).animationName === "highlight-glow"
        ));
        if (glow && typeof now === "number" && now - flashStartTime < 2400) {
          glow.startTime = flashStartTime;
          elapsedMs = Math.max(0, now - flashStartTime);
        }
      }
      highlightTimeout = window.setTimeout(() => {
        card.classList.remove("highlight-active-card");
      }, 2500 - elapsedMs);
    };

    const scrollToCard = () => {
      const card = selectedCard();
      if (!card) return;

      const isMobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches ||
        Boolean(card.closest(".mobile-view-content-wrapper"));
      const list = card.closest<HTMLElement>(".line-impact-panel-stack") ??
        card.closest<HTMLElement>(".alert-stack, .closure-stack");
      if (!list) return;

      const cardRect = card.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const scrollMarginTop = Number.parseFloat(window.getComputedStyle(card).scrollMarginTop) || 0;
      const alignmentOffset = isMobile
        ? scrollMarginTop
        : Math.max(0, (list.clientHeight - cardRect.height) / 2);
      const targetTop = list.scrollTop + cardRect.top - listRect.top - alignmentOffset;

      list.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    };

    if (lastSelectionGlow?.selection !== selection) {
      const skipGlow = pendingSkipGlow?.kind === selection.kind && pendingSkipGlow.id === selection.id;
      pendingSkipGlow = null;
      lastSelectionGlow = { selection, skipGlow };
    }
    if (!lastSelectionGlow.skipGlow) {
      cancelIntroWait = whenMapSelectionIntroStarts(selection, highlightCard);
    }

    const wrapper = document.querySelector<HTMLElement>(
      ".desktop-view-content-wrapper, .mobile-view-content-wrapper",
    );
    const wrapperAnimationNames = new Set(
      wrapper
        ? window.getComputedStyle(wrapper).animationName
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name !== "none")
        : [],
    );
    let scrollTimeout: number | undefined;
    let hasScrolled = false;

    const handleWrapperAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== wrapper || !wrapperAnimationNames.has(event.animationName) || hasScrolled) return;
      hasScrolled = true;
      if (scrollTimeout !== undefined) window.clearTimeout(scrollTimeout);
      wrapper?.removeEventListener("animationend", handleWrapperAnimationEnd);
      scrollToCard();
    };

    if (wrapper && wrapperAnimationNames.size > 0) {
      wrapper.addEventListener("animationend", handleWrapperAnimationEnd);
      scrollTimeout = window.setTimeout(() => {
        if (hasScrolled) return;
        hasScrolled = true;
        wrapper.removeEventListener("animationend", handleWrapperAnimationEnd);
        scrollToCard();
      }, 320);
    } else {
      scrollTimeout = window.setTimeout(scrollToCard, 0);
    }

    return () => {
      if (scrollTimeout !== undefined) window.clearTimeout(scrollTimeout);
      if (highlightTimeout !== undefined) window.clearTimeout(highlightTimeout);
      cancelIntroWait?.();
      wrapper?.removeEventListener("animationend", handleWrapperAnimationEnd);
      const card = selectedCard();
      if (card) {
        card.classList.remove("highlight-active-card");
      }
    };
  }, [kind, selection]);
}
