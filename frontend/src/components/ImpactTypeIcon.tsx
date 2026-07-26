"use client";

import { AlertTriangle, Construction } from "lucide-react";
import type { ImpactKind } from "../app/linewatch-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function impactTypeIconClass(kind: ImpactKind, className = "") {
  return classNames("impact-type-icon", kind, className);
}

export function ImpactTypeIcon({
  kind,
  size = 18,
  className = "",
}: {
  kind: ImpactKind;
  size?: number;
  className?: string;
}) {
  const iconClassName = impactTypeIconClass(kind, className);

  if (kind === "delay") {
    return <DelayIcon size={size} className={iconClassName} />;
  }

  if (kind === "reduced-speed-zone") {
    return <Construction size={size} className={iconClassName} />;
  }

  if (kind === "planned-closure") {
    return <PlannedClosureIcon size={size} className={iconClassName} />;
  }

  return <AlertTriangle size={size} className={iconClassName} />;
}
