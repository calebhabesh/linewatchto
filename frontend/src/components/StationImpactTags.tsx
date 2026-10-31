import { Bus } from "lucide-react";
import { TransitLineBadge } from "./TransitLineBadge";

type StationImpactTagsProps = {
  /** The affected line, shown at every station as a quick visual cue. */
  lineId?: string | null;
  /** Replacement service stated by the source. */
  replacement?: "go-bus" | "bus" | null;
};

export function replacementTagLabel(replacement: StationImpactTagsProps["replacement"]) {
  return replacement === "go-bus" ? "GO Buses" : replacement === "bus" ? "Shuttle Buses" : null;
}

/** Line badge and replacement-bus chip at the end of a station impact card's heading row. */
export function StationImpactTags({ lineId, replacement }: StationImpactTagsProps) {
  const busLabel = replacementTagLabel(replacement);
  if (!lineId && !busLabel) return null;
  return (
    <span className="station-impact-tags ml-auto flex shrink-0 items-center gap-1.5" data-station-impact-tags>
      {busLabel ? (
        <span
          className="station-impact-bus-tag inline-flex h-6 items-center gap-1 rounded-md border border-black/10 bg-white/70 px-1.5 text-[11px] font-bold text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
          data-station-impact-replacement={replacement ?? undefined}
        >
          <Bus size={14} className="shrink-0" aria-hidden="true" />
          <span>{busLabel}</span>
        </span>
      ) : null}
      {lineId ? (
        <span className="inline-flex" data-station-impact-line={lineId}>
          <TransitLineBadge lineId={lineId} size={24} className="station-impact-line-badge shrink-0" />
        </span>
      ) : null}
    </span>
  );
}
