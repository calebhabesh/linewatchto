"use client";

import { useEffect } from "react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";

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

      card.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    highlightCard();

    const wrapper = document.querySelector<HTMLElement>(
      ".desktop-view-content-wrapper, .mobile-view-content-wrapper",
    );
    const expectedAnimationName = wrapper?.classList.contains("desktop-view-content-wrapper")
      ? "desktop-content-fade-in"
      : "mobile-content-fade-in";
    const wrapperAnimation = wrapper
      ? window.getComputedStyle(wrapper).animationName
      : "none";
    let scrollTimeout: number | undefined;
    let hasScrolled = false;

    const handleWrapperAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== wrapper || event.animationName !== expectedAnimationName || hasScrolled) return;
      hasScrolled = true;
      if (scrollTimeout !== undefined) window.clearTimeout(scrollTimeout);
      wrapper?.removeEventListener("animationend", handleWrapperAnimationEnd);
      scrollToCard();
    };

    if (wrapper && wrapperAnimation.split(",").map((name) => name.trim()).includes(expectedAnimationName)) {
      wrapper.addEventListener("animationend", handleWrapperAnimationEnd);
      scrollTimeout = window.setTimeout(() => {
        if (hasScrolled) return;
        hasScrolled = true;
        wrapper.removeEventListener("animationend", handleWrapperAnimationEnd);
        scrollToCard();
      }, 480);
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
