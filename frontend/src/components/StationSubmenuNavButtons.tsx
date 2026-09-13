"use client";

import type { ReactNode } from "react";

export type StationSubmenuNavItem = {
  id: string;
  label: string;
  shortLabel?: string;
  icon: ReactNode;
  count?: number;
};

type Props = {
  items: StationSubmenuNavItem[];
  onJumpToSection: (sectionId: string) => void;
  className?: string;
};

export function StationSubmenuNavButtons({ items, onJumpToSection, className }: Props) {
  if (items.length <= 1) return null;

  return (
    <div className={`flex w-full min-w-0 max-w-full flex-col gap-1.5 md:gap-2 shrink-0 ${className ?? "mt-1 md:mt-3.5"}`} data-station-submenu-nav>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Jump To
      </span>
      <nav
        className="grid grid-cols-3 w-full min-w-0 max-w-full gap-1.5 md:gap-2"
        aria-label="Station subsections quick navigation"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onJumpToSection(item.id)}
            className="station-submenu-nav-btn group relative flex h-8.5 md:h-9.5 w-full min-w-0 max-w-full items-center justify-center gap-1.5 md:gap-2 rounded-md px-1.5 md:px-2.5 py-1 md:py-1.5 text-slate-700 dark:text-slate-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-98 text-[11px] font-semibold"
            aria-label={`Jump to ${item.label}`}
            title={`Jump to ${item.label}`}
            data-station-nav-target={item.id}
          >
            <span className="flex items-center justify-center shrink-0">
              {item.icon}
            </span>
            <span className="truncate font-bold text-[11px] leading-relaxed py-0.5 min-w-0 flex-1 text-center">
              {item.shortLabel ?? item.label}
            </span>
            {item.count !== undefined && item.count > 0 ? (
              <span
                className="station-submenu-count-badge"
                data-single-digit={item.count < 10 ? "true" : undefined}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
