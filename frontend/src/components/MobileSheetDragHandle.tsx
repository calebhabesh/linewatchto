"use client";

import type { HTMLAttributes } from "react";

type Props = {
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  isExpanded?: boolean;
  className?: string;
};

export function MobileSheetDragHandle({
  dragHandleProps,
  isDragging = false,
  isExpanded = false,
  className = "",
}: Props) {
  return (
    <div
      className={`station-sheet-drag-handle-container md:hidden flex items-center justify-center w-full pt-2 pb-3 -mt-2 min-h-[36px] cursor-grab active:cursor-grabbing select-none touch-none outline-none focus:outline-none focus-visible:outline-none shrink-0 ${isDragging ? "cursor-grabbing" : ""} ${className}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
      data-mobile-sheet-drag-handle
      data-dragging={isDragging ? "true" : undefined}
      data-expanded={isExpanded ? "true" : undefined}
      {...dragHandleProps}
    >
      <div
        className="station-sheet-drag-pill relative flex items-center justify-center h-2 w-14 rounded-full bg-slate-400/60 dark:bg-zinc-600 shadow-xs outline-none select-none pointer-events-none"
        aria-hidden="true"
      >
        <span className="station-sheet-drag-ridges flex items-center justify-center gap-1.5 w-full h-full pointer-events-none select-none" aria-hidden="true">
          <span className="h-1.5 w-[2px] rounded-full bg-slate-600/80 dark:bg-zinc-300 pointer-events-none select-none" />
          <span className="h-1.5 w-[2px] rounded-full bg-slate-600/80 dark:bg-zinc-300 pointer-events-none select-none" />
          <span className="h-1.5 w-[2px] rounded-full bg-slate-600/80 dark:bg-zinc-300 pointer-events-none select-none" />
        </span>
      </div>
    </div>
  );
}
