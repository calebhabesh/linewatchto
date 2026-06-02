"use client";

import Image from "next/image";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { ImpactRouteHeader, LineBadge, MetadataGrid } from "./ImpactCardFields";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
}

export function DelaysPanel({ selection, onSelectImpact, onBack }: Props) {
  const { delays } = useDashboardData();
  useScrollSelectedImpactCard(selection, "delay");

  const handleDelayClick = (delayId: string) => {
    onSelectImpact(
      selection?.kind === "delay" && selection.id === delayId
        ? null
        : { kind: "delay", id: delayId },
    );
  };

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3 whitespace-nowrap">
            <Image src="/assets/linewatch/delay-icon.svg" alt="" width={22} height={22} className="shrink-0" />
            Delays
          </h2>
        </div>
        <span className="shrink-0 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
          {delays.length} {delays.length === 1 ? "Delay" : "Delays"}
        </span>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {delays.map((delay) => {
          const isActive = selection?.kind === "delay" && selection.id === delay.id;
          return (
            <article
              key={delay.id}
              data-impact-card-id={delay.id}
              className={`alert-card min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 border-l-amber-500 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                isActive ? "!bg-amber-50 dark:!bg-amber-950" : ""
              }`}
            >
              <span className="sr-only">Started and Updated timing</span>
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <LineBadge lineId={delay.lineId} lineNumber={delay.lineNumber} />
                  <Image src="/assets/linewatch/delay-icon.svg" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words mt-0.5">
                    {delay.title}
                  </strong>
                </div>
              </div>

              <ImpactRouteHeader location={delay.location} />

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {delay.description}
              </p>

              <MetadataGrid
                cause={delay.cause}
                source={delay.source}
                startedAt={delay.startedAt}
                updatedAt={delay.updatedAt}
              />

              <button
                type="button"
                onClick={() => handleDelayClick(delay.id)}
                className={`preview-button mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border whitespace-normal ${
                  isActive
                    ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                }`}
              >
                {isActive ? (
                  <>
                    <EyeOff size={14} />
                    Clear Highlight
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    Highlight on Map
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
