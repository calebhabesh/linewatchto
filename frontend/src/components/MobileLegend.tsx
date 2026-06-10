"use client";

import Image from "next/image";

const LINES = [
  { id: "line-1", name: "Line 1 Yonge-University", icon: "/assets/linewatch/line-1-legend.svg?v=2" },
  { id: "line-2", name: "Line 2 Bloor-Danforth", icon: "/assets/linewatch/line-2-legend.svg?v=2" },
  { id: "line-4", name: "Line 4 Sheppard", icon: "/assets/linewatch/line-4-legend.svg?v=2" },
  { id: "line-5", name: "Line 5 Eglinton", icon: "/assets/linewatch/line-5-legend.svg?v=2" },
  { id: "line-6", name: "Line 6 Finch West", icon: "/assets/linewatch/line-6-legend.svg?v=2" },
];

export function MobileLegend({ 
  closingSoon, 
  expanded = false, 
  onToggleExpanded,
}: { 
  closingSoon?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  return (
    <div
      onClick={onToggleExpanded}
      className={`mobile-legend-pill fixed left-4 flex flex-col gap-1.5 p-2 bg-white/95 dark:bg-[#0a0c10]/95 border border-black/10 dark:border-white/10 rounded-xl shadow-xl transition-all duration-300 ease-in-out cursor-pointer select-none md:hidden ${
        closingSoon ? "top-[80px]" : "top-4"
      } ${
        expanded ? "w-[220px]" : "w-[36px]"
      }`}
      style={{ zIndex: expanded ? 41 : 35 }}
      role="button"
      aria-expanded={expanded}
      aria-label="Transit line legend"
    >
      {LINES.map((line) => (
        <div key={line.id} className="flex items-center gap-2 overflow-hidden">
          <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0">
            <Image
              src={line.icon}
              alt={`${line.name} icon`}
              width={20}
              height={20}
              className="opacity-95"
            />
          </div>
          <span
            className={`text-[11px] font-black tracking-wider text-slate-800 dark:text-slate-200 transition-all duration-300 whitespace-nowrap ${
              expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"
            }`}
          >
            {line.name}
          </span>
        </div>
      ))}
    </div>
  );
}
