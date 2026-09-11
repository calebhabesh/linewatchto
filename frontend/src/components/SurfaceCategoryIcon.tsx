"use client";

import { CalendarClock, CircleX, CornerUpRight, GitBranch, Info } from "lucide-react";

export function getSurfaceCategoryColor(category: string): string {
  const cat = category.toLowerCase();
  switch (cat) {
    case "no-service":
      return "text-red-600 dark:text-red-400";
    case "detour":
      return "text-purple-600 dark:text-purple-400";
    case "bypass":
      return "text-amber-600 dark:text-amber-400";
    case "service-change":
      return "text-blue-600 dark:text-blue-400";
    default:
      return "text-sky-600 dark:text-sky-400";
  }
}

export function SurfaceCategoryIcon({
  category,
  size = 12,
  className = "",
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const cat = category.toLowerCase();
  const colorClass = getSurfaceCategoryColor(cat);
  const classes = className ? `${colorClass} ${className}` : colorClass;
  if (cat === "no-service") {
    return <CircleX size={size} className={classes} aria-hidden="true" />;
  }
  if (cat === "detour") {
    return <GitBranch size={size} className={classes} aria-hidden="true" />;
  }
  if (cat === "bypass") {
    return <CornerUpRight size={size} className={classes} aria-hidden="true" />;
  }
  if (cat === "service-change") {
    return <CalendarClock size={size} className={classes} aria-hidden="true" />;
  }
  return <Info size={size} className={classes} aria-hidden="true" />;
}
