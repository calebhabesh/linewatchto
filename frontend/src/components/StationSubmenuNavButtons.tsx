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
};

export function StationSubmenuNavButtons({ items, onJumpToSection }: Props) {
  if (items.length <= 1) return null;

  return (
    <div className="mt-2.5 flex w-full min-w-0 max-w-full flex-col gap-1.5 shrink-0" data-station-submenu-nav>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Jump To
      </span>
      <nav
        className="grid grid-cols-3 w-full min-w-0 max-w-full gap-1.5"
        aria-label="Station subsections quick navigation"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onJumpToSection(item.id)}
            className="group relative flex h-7.5 w-full min-w-0 max-w-full items-center justify-center gap-1.5 rounded-md border border-black/10 bg-slate-100/90 px-1.5 py-1 text-slate-700 hover:border-black/20 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-98 shadow-xs text-[11px] font-semibold overflow-hidden"
            aria-label={`Jump to ${item.label}`}
            title={`Jump to ${item.label}`}
            data-station-nav-target={item.id}
          >
            <span className="flex items-center justify-center shrink-0">
              {item.icon}
            </span>
            <span className="truncate font-bold text-[11px] leading-none min-w-0 flex-1 text-center">
              {item.shortLabel ?? item.label}
            </span>
            {item.count !== undefined && item.count > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-300/90 px-1 text-[10px] font-bold text-slate-800 dark:bg-white/20 dark:text-slate-100 shrink-0 leading-none">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
