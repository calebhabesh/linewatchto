"use client";

import { Bookmark, LoaderCircle, X } from "lucide-react";

type Props = {
  stationName: string;
  updating?: boolean;
  saved: boolean;
  savePending: boolean;
  saveDisabled?: boolean;
  onToggleSaved: () => void;
  onClose: () => void;
  closeLabel?: string;
};

export function StationDetailHeader({
  stationName,
  updating = false,
  saved,
  savePending,
  saveDisabled = false,
  onToggleSaved,
  onClose,
  closeLabel = "Close station details",
}: Props) {
  return (
    <header className="station-detail-header flex items-start justify-between gap-3 shrink-0">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Station
        </span>
        <h2 className="mt-1 break-words text-3xl font-black text-slate-950 dark:text-white">
          {stationName}
        </h2>
        {updating ? (
          <span className="station-detail-updating" role="status">
            Updating
          </span>
        ) : null}
      </div>
      <div className="station-detail-header-actions">
        <div className="station-detail-save-control">
          <button
            type="button"
            onClick={onToggleSaved}
            disabled={savePending || saveDisabled}
            className={saved ? "saved" : ""}
            aria-pressed={saved}
            aria-label={`${saved ? "Remove" : "Save"} ${stationName} ${saved ? "from" : "to"} My Stations`}
          >
            {savePending
              ? <LoaderCircle size={20} className="station-detail-save-spinner" />
              : <Bookmark size={20} fill={saved ? "currentColor" : "none"} />}
            <span>{saved ? "Saved" : "Save"}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="station-detail-close-button h-11 w-11"
          aria-label={closeLabel}
        >
          <X size={20} />
        </button>
      </div>
    </header>
  );
}
