"use client";

import { TransitLineBadge } from "./TransitLineBadge";

const TTC_LINES = [
  { id: "line-1", number: "1", name: "Line 1 Yonge-University" },
  { id: "line-2", number: "2", name: "Line 2 Bloor-Danforth" },
  { id: "line-4", number: "4", name: "Line 4 Sheppard" },
  { id: "line-5", number: "5", name: "Line 5 Eglinton" },
  { id: "line-6", number: "6", name: "Line 6 Finch West" },
];

const REGIONAL_LINES = [
  { id: "go-br", number: "BR", name: "Barrie Line" },
  { id: "go-ki", number: "KI", name: "Kitchener Line" },
  { id: "go-le", number: "LE", name: "Lakeshore East Line" },
  { id: "go-lw", number: "LW", name: "Lakeshore West Line" },
  { id: "go-mi", number: "MI", name: "Milton Line" },
  { id: "go-rh", number: "RH", name: "Richmond Hill Line" },
  { id: "go-st", number: "ST", name: "Stouffville Line" },
  { id: "up-express", number: "UP", name: "Union Pearson Express" },
];

export function MobileLegend({ 
  mode = "ttc",
  closingSoon, 
  expanded = false, 
  onToggleExpanded,
}: { 
  mode?: "ttc" | "regional";
  closingSoon?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const isRegional = mode === "regional";
  const lines = isRegional ? REGIONAL_LINES : TTC_LINES;
  return (
    <div
      onClick={onToggleExpanded}
      className={`mobile-legend-pill fixed left-4 flex flex-col gap-1.5 p-2 bg-white/95 dark:bg-[#0a0c10]/95 border border-black/10 dark:border-white/10 rounded-xl shadow-xl overflow-hidden cursor-pointer select-none md:hidden ${
        closingSoon ? "mobile-legend-pill--announcement" : "top-4"
      } ${
        isRegional ? "mobile-legend-pill--regional" : ""
      } ${
        expanded
          ? "w-max max-w-[215px] pr-3.5 mobile-legend-pill--expanded"
          : isRegional
            ? "w-[40px] max-w-[40px]"
            : "w-[38px] max-w-[38px]"
      }`}
      style={{ zIndex: expanded ? 41 : 35 }}
      role="button"
      aria-expanded={expanded}
      aria-label="Transit line legend"
    >
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`flex items-center h-[20px] overflow-hidden ${
              expanded ? "gap-2" : "w-full justify-center gap-0"
            }`}
          >
            <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0 relative z-10">
              <TransitLineBadge
                lineId={line.id}
                lineNumber={line.number}
                size={20}
                className="opacity-95"
              />
            </div>
            <span
              className={`legend-line-name font-subway text-[13px] leading-tight font-bold tracking-normal text-slate-800 dark:text-slate-200 overflow-hidden whitespace-nowrap ${
                expanded
                  ? "opacity-100 translate-x-0 max-w-[165px]"
                  : "w-0 max-w-0 opacity-0 translate-x-1 pointer-events-none"
              }`}
            >
              {line.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
