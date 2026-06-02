"use client";

import { useEffect } from "react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";

export function useScrollSelectedImpactCard(
  selection: ImpactSelection,
  kind: ImpactKind,
) {
  useEffect(() => {
    if (selection?.kind !== kind) return;
    const card = document.querySelector<HTMLElement>(
      `[data-impact-card-id="${CSS.escape(selection.id)}"]`,
    );
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [kind, selection]);
}
