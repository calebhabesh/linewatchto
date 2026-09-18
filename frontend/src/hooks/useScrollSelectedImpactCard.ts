"use client";

import { useEffect } from "react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { MOBILE_VIEWPORT_QUERY } from "./useMobilePerformanceMode";

export function useScrollSelectedImpactCard(
  selection: ImpactSelection,
  kind: ImpactKind,
) {
  useEffect(() => {
    if (!selection) return;
    const isMatch = selection.kind === kind ||
      (kind === "suspension" && selection.kind === "planned-closure");
    if (!isMatch) return;

    let highlightTimeout: number | undefined;

    const selectedCard = () => document.querySelector<HTMLElement>(
      `[data-impact-card-id="${CSS.escape(selection.id)}"]`,
    );

    const highlightCard = () => {
      const card = selectedCard();
      if (!card) return;

      card.classList.remove("highlight-active-card");
      void card.offsetWidth;
      card.classList.add("highlight-active-card");
      highlightTimeout = window.setTimeout(() => {
        card.classList.remove("highlight-active-card");
      }, 2500);
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

    highlightCard();

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
      wrapper?.removeEventListener("animationend", handleWrapperAnimationEnd);
      const card = selectedCard();
      if (card) {
        card.classList.remove("highlight-active-card");
      }
    };
  }, [kind, selection]);
}
