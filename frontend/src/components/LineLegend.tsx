"use client";

import Image from "next/image";

const LINES = [
  { id: "line-1", name: "Line 1 Yonge-University", icon: "/assets/linewatch/line-1-legend.svg" },
  { id: "line-2", name: "Line 2 Bloor-Danforth", icon: "/assets/linewatch/line-2-legend.svg" },
  { id: "line-4", name: "Line 4 Sheppard", icon: "/assets/linewatch/line-4-legend.svg" },
  { id: "line-5", name: "Line 5 Eglinton", icon: "/assets/linewatch/line-5-legend.svg" },
  { id: "line-6", name: "Line 6 Finch West", icon: "/assets/linewatch/line-6-legend.svg" },
];

export function LineLegend() {
  return (
    <div className="flex flex-col gap-4 pointer-events-none select-none">
      {LINES.map(line => (
        <div key={line.id} className="flex items-center gap-3.5">
          <Image 
            src={line.icon} 
            alt={`${line.name} icon`} 
            width={44} 
            height={44} 
            className="opacity-95"
          />
          <span className="text-slate-500 dark:text-white/70 text-base font-extrabold tracking-widest">{line.name}</span>
        </div>
      ))}
    </div>
  );
}
