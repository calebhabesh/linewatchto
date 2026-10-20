import { Clock, RefreshCw } from "lucide-react";

export type ServiceFreshnessState = "live" | "sync" | "cached" | "unknown" | "source";

type Props = {
  state: ServiceFreshnessState;
  /** Visible text for the "source" state, e.g. a compact provider label. */
  sourceLabel?: string;
};

const LABELS: Record<Exclude<ServiceFreshnessState, "source">, { text: string; name: string }> = {
  live: { text: "LIVE", name: "Live" },
  sync: { text: "SYNC", name: "Syncing" },
  cached: { text: "CACHED", name: "Cached" },
  unknown: { text: "UNKNOWN", name: "Unknown" },
};

/** Current Service freshness pill. LIVE, SYNC and CACHED share one width (see current-service.css). */
export function ServiceFreshnessBadge({ state, sourceLabel = "" }: Props) {
  if (state === "source") {
    return (
      <div className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--source" aria-label={`Source: ${sourceLabel}`}>
        <span className="mobile-service-sheet-led-jewel mobile-service-sheet-led-jewel--muted" aria-hidden="true" />
        <span className="mobile-service-sheet-recessed-text" aria-hidden="true">{sourceLabel}</span>
      </div>
    );
  }

  const { text, name } = LABELS[state];
  const modifier = state === "live" ? "" : state === "sync" ? " mobile-service-sheet-recessed-badge--sync" : " mobile-service-sheet-recessed-badge--cached";
  return (
    <div className={`mobile-service-sheet-recessed-badge${modifier}`} role={state === "sync" ? "status" : undefined} aria-label={name}>
      {state === "live" ? (
        <span className="mobile-service-sheet-led-jewel" aria-hidden="true" />
      ) : state === "sync" ? (
        <RefreshCw size={11} strokeWidth={2.5} className="mobile-service-sheet-badge-icon mobile-service-sheet-badge-icon--spin" aria-hidden="true" />
      ) : (
        <Clock size={11} strokeWidth={2.5} className="mobile-service-sheet-badge-icon" aria-hidden="true" />
      )}
      <span className="mobile-service-sheet-recessed-text" aria-hidden="true">{text}</span>
    </div>
  );
}
