import { CalendarClock, CircleAlert, MapPin, TrainFront } from "lucide-react";
import { formatImpactTimestamp, formatOperationalDateTime } from "../app/impact-time";
import {
  regionalTripChangeLabel,
  type RegionalTripChangeResponse,
} from "../app/regional-trip-changes";
import { TransitLineBadge } from "./TransitLineBadge";

type Props = {
  data: RegionalTripChangeResponse | null;
  loading?: boolean;
  compact?: boolean;
  emptyLabel?: string;
};

function changeTone(kind: string) {
  return kind === "cancellation"
    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200"
    : kind === "skipped-stop"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
      : "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-200";
}

export function RegionalTripChangesList({
  data,
  loading = false,
  compact = false,
  emptyLabel = "No upcoming confidently matched GO train changes.",
}: Props) {
  if (loading) {
    return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Checking GO train changes...</p>;
  }
  if (!data?.fresh) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        GO train changes are unavailable while the operational feeds are stale or disabled.
      </p>
    );
  }
  if (data.changes.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3" aria-label="Upcoming GO train changes">
      {data.changes.map((change) => {
        const visibleStops = compact ? change.affectedStops.slice(0, 4) : change.affectedStops.slice(0, 8);
        const remainingStops = change.affectedStops.length - visibleStops.length;
        return (
          <article
            key={change.id}
            className="rounded-lg border border-black/10 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-[#12151c]/80"
            data-trip-change-kind={change.kind}
          >
            <div className="flex items-start gap-2.5">
              <TransitLineBadge
                lineId={change.lineId}
                lineNumber={change.lineNumber}
                lineName={change.lineName}
                size={26}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-sm font-black text-slate-900 dark:text-white">
                    Train {change.tripNumber || change.tripId}
                  </strong>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${changeTone(change.kind)}`}>
                    {regionalTripChangeLabel(change.kind)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {change.lineName}{change.destination ? ` to ${change.destination}` : ""}
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {change.scheduledStartAt ? (
                <div className="flex items-start gap-2">
                  <CalendarClock size={14} className="mt-0.5 shrink-0 text-slate-500" />
                  <div><dt className="font-black uppercase tracking-wider text-slate-500">Scheduled</dt><dd className="font-semibold text-slate-800 dark:text-slate-100">{formatOperationalDateTime(change.scheduledStartAt)}</dd></div>
                </div>
              ) : null}
              {change.updatedAt ? (
                <div className="flex items-start gap-2">
                  <CircleAlert size={14} className="mt-0.5 shrink-0 text-slate-500" />
                  <div><dt className="font-black uppercase tracking-wider text-slate-500">Observed</dt><dd className="font-semibold text-slate-800 dark:text-slate-100">{formatImpactTimestamp(change.updatedAt)}</dd></div>
                </div>
              ) : null}
            </dl>

            <div className="mt-3 flex items-start gap-2 rounded-md border border-black/10 bg-slate-50 px-2.5 py-2 dark:border-white/10 dark:bg-black/10">
              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {change.kind === "cancellation" ? "Scheduled stops affected" : "Stop change"}
                </p>
                <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                  {visibleStops.map((stop) => stop.stationName).join(" · ")}
                  {remainingStops > 0 ? ` · +${remainingStops} more` : ""}
                </p>
              </div>
            </div>
          </article>
        );
      })}
      {!compact ? (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
          <TrainFront size={14} className="mt-0.5 shrink-0" />
          Only operational records confidently matched to the published GO schedule are shown. Check GO Transit before travelling.
        </p>
      ) : null}
    </div>
  );
}
