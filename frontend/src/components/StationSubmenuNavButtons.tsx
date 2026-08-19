"use client";

import type { ReactNode } from "react";

export type StationSubmenuNavItem = {
  id: string;
  label: string;
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
    <div className="mt-2.5 flex flex-col gap-1 shrink-0" data-station-submenu-nav>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Jump To
      </span>
      <nav
        className="flex items-center gap-1.5 flex-wrap"
        aria-label="Station subsections quick navigation"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onJumpToSection(item.id)}
            className="group relative inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-black/10 bg-slate-100/90 px-2 text-slate-700 hover:border-black/20 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95 shadow-xs text-xs font-semibold"
            aria-label={`Jump to ${item.label}`}
            title={`Jump to ${item.label}`}
            data-station-nav-target={item.id}
          >
            <span className="flex items-center justify-center shrink-0">
              {item.icon}
            </span>
            {item.count !== undefined && item.count > 0 ? (
              <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-300/90 px-1 text-[9.5px] font-black text-slate-800 dark:bg-white/20 dark:text-white leading-none">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
