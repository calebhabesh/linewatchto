"use client";

import { CalendarClock, CircleX, CornerUpRight, GitBranch, Info } from "lucide-react";

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
  if (cat === "no-service") {
    return <CircleX size={size} className={className} aria-hidden="true" />;
  }
  if (cat === "detour") {
    return <GitBranch size={size} className={className} aria-hidden="true" />;
  }
  if (cat === "bypass") {
    return <CornerUpRight size={size} className={className} aria-hidden="true" />;
  }
  if (cat === "service-change") {
    return <CalendarClock size={size} className={className} aria-hidden="true" />;
  }
  return <Info size={size} className={className} aria-hidden="true" />;
}
