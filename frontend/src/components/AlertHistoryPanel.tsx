"use client";

import { ChevronLeft, X, History } from "lucide-react";
import { AlertHistoryTimeline } from "./AlertHistoryTimeline";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export function AlertHistoryPanel({ onBack, onClose }: Props) {
  return (
    <section className="alert-history-panel panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" aria-label="Alert history panel">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack ? (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Back">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          ) : null}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
            <History className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" aria-hidden="true" />
            <span>Alert History</span>
          </h2>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        ) : null}
      </div>

      <div className="notification-settings-scroll">
        <AlertHistoryTimeline />
      </div>
    </section>
  );
}
