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
    const card = document.querySelector<HTMLElement>(
      `[data-impact-card-id="${CSS.escape(selection.id)}"]`,
    );
    if (!card) return;

    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.remove("highlight-active-card");
    void card.offsetWidth;
    card.classList.add("highlight-active-card");

    const timeout = window.setTimeout(() => {
      card.classList.remove("highlight-active-card");
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
      card.classList.remove("highlight-active-card");
    };
  }, [kind, selection]);
}
