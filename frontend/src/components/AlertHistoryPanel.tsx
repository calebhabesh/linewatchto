"use client";

import { ChevronLeft, X, History } from "lucide-react";
import { AlertHistoryTimeline } from "./AlertHistoryTimeline";
import type { NetworkId } from "../app/regional-data";

type Props = {
  onBack: () => void;
  onClose: () => void;
  network: NetworkId;
};

export function AlertHistoryPanel({ onBack, onClose, network }: Props) {
  return (
    <section className="alert-history-panel panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" aria-label="Alert history panel">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Back"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
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
            className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        ) : null}
      </div>

      <div className="notification-settings-scroll">
        <AlertHistoryTimeline network={network} />
      </div>
    </section>
  );
}
