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
      className={`station-sheet-drag-handle-container md:hidden flex items-center justify-center w-full pt-1.5 pb-2.5 -mt-2.5 cursor-grab active:cursor-grabbing select-none touch-none focus-visible:outline-none ${isDragging ? "cursor-grabbing" : ""} ${className}`}
      data-mobile-sheet-drag-handle
      data-dragging={isDragging ? "true" : undefined}
      data-expanded={isExpanded ? "true" : undefined}
      {...dragHandleProps}
    >
      <div
        className="station-sheet-drag-pill relative flex items-center justify-center h-1.5 w-11 rounded-full bg-slate-300 dark:bg-zinc-700 transition-all duration-150"
        aria-hidden="true"
      >
        <span className="station-sheet-drag-ridges flex items-center justify-center gap-1 w-full h-full pointer-events-none" aria-hidden="true">
          <span className="h-1 w-[1.5px] rounded-full bg-slate-400/80 dark:bg-zinc-500" />
          <span className="h-1 w-[1.5px] rounded-full bg-slate-400/80 dark:bg-zinc-500" />
          <span className="h-1 w-[1.5px] rounded-full bg-slate-400/80 dark:bg-zinc-500" />
        </span>
      </div>
    </div>
  );
}
