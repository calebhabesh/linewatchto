"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation, ChevronDown, ChevronLeft, Loader2, MapPinned, X, AlertTriangle, Construction, Calendar } from "lucide-react";
import {
  createSavedCommute,
  deleteSavedCommute,
  getSavedCommutes,
  type AccountSavedCommute,
  type AccountState,
  type AccountMatchedImpact,
} from "../app/account-data";
import type { StationSummary } from "../app/station-data";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
import { DelayIcon } from "./DelayIcon";

// drawer-layout.test.mjs compatibility: grid-cols-1

interface Props {
  onBack?: () => void;
  onClose?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationSummaries: StationSummary[];
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute) => void;
  onClearViewedPath: (commuteId: string) => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
}

function commuteTone(commute: AccountSavedCommute) {
  switch (commute.impact.severity) {
    case "suspended":
    case "major":
      return "danger";
    case "minor":
    case "planned":
      return "warning";
    case "unavailable":
      return "neutral";
    case "clear":
    default:
      return "ok";
  }
}

function ImpactIcon({ kind, className }: { kind: AccountMatchedImpact["kind"]; className?: string }) {
  switch (kind) {
    case "reduced-speed-zone":
      return <Construction className={`rsz-tone ${className || ""}`} size={14} />;
    case "planned-closure":
      return <Calendar className={`text-blue-500 dark:text-blue-400 ${className || ""}`} size={14} />;
    case "suspension":
      return <AlertTriangle className={`text-red-500 dark:text-red-400 ${className || ""}`} size={14} />;
    case "delay":
    default:
      return <DelayIcon className={`text-amber-500 dark:text-amber-400 ${className || ""}`} size={14} filled={false} />;
  }
}

function impactKindLabel(kind: AccountMatchedImpact["kind"]) {
  switch (kind) {
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
    case "planned-closure":
      return "Planned Closure";
    case "suspension":
      return "Suspension";
    case "delay":
    default:
      return "Delay";
  }
}

function impactLineLabel(impact: AccountMatchedImpact) {
  return impact.lineNumber ? `Line ${impact.lineNumber}` : "Station";
}

function routeSummary(commute: AccountSavedCommute) {
  return commute.path.status === "available" ? commute.path.summary : "Route path unavailable";
}

export function SavedCommutesPanel({
  onBack,
  onClose,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationSummaries,
  viewedCommuteId,
  onViewPath,
  onClearViewedPath,
  onRequestSignIn,
  onRequestCreateAccount,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [expandedCommuteId, setExpandedCommuteId] = useState<string | null>(null);
  const [deletingCommuteId, setDeletingCommuteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!accountState.authenticated) {
      setAccountCommutes([]);
      return () => {
        cancelled = true;
      };
    }
    getSavedCommutes().then((result) => {
      if (!cancelled && result.source === "backend") {
        setAccountCommutes(result.commutes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountState.authenticated, setAccountCommutes]);

  const stationById = useMemo(() => {
    return new Map(stationSummaries.map((station) => [station.id, station]));
  }, [stationSummaries]);

  function stationNameFor(stationId: string) {
    return stationById.get(stationId)?.name ?? stationId;
  }

  const handleCreateCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
      return;
    }
    if (originStationId === destinationStationId) {
      setCommuteError("Choose two different stations.");
      return;
    }
    setSaving(true);
    setCommuteError(null);
    try {
      const created = await createSavedCommute({
        label: newLabel,
        originStationId,
        destinationStationId,
      });
      setAccountCommutes([...accountCommutes, created]);
      setNewLabel("");
      setOriginStationId("");
      setDestinationStationId("");
    } catch {
      setCommuteError("Could not save that commute.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCommute = async (id: string) => {
    try {
      await deleteSavedCommute(id);
      setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
      onClearViewedPath(id);
      setExpandedCommuteId((current) => current === id ? null : current);
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };

  return (
    <section className="commute-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
            <Navigation className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" />
            <span>Saved Commutes</span>
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        )}
      </div>
      <div className="commute-grid min-w-0 p-3 flex flex-col gap-3">
        {!accountState.authenticated ? (
          <div className="saved-commute-account-prompt">
            <strong>Account required</strong>
            <span>Sign in or create an account to view saved commutes.</span>
            <div className="account-action-row">
              <button type="button" onClick={onRequestSignIn}>Sign In</button>
              <button type="button" onClick={onRequestCreateAccount}>Create Account</button>
            </div>
          </div>
        ) : null}

        {accountState.authenticated ? (
          <div className="saved-commute-form">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create a Route</h3>
              {accountState.user?.demo ? (
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Demo account</span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Route impacts enabled</span>
              )}
            </div>
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Commute Label" aria-label="Saved commute label" />
            <div className="saved-commute-station-grid">
              <SavedCommuteStationPicker
                label="Origin"
                placeholder="Origin Station"
                value={originStationId}
                stations={stationSummaries}
                blockedStationId={destinationStationId || undefined}
                blockedLabel="Already selected as destination"
                onChange={setOriginStationId}
              />
              <SavedCommuteStationPicker
                label="Destination"
                placeholder="Destination Station"
                value={destinationStationId}
                stations={stationSummaries}
                blockedStationId={originStationId || undefined}
                blockedLabel="Already selected as origin"
                onChange={setDestinationStationId}
              />
            </div>
            <button
              type="button"
              className="saved-commute-primary-button"
              onClick={handleCreateCommute}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="saved-commute-loading-icon" aria-hidden="true" />
                  Plotting route
                </>
              ) : (
                "Save commute"
              )}
            </button>
            {commuteError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{commuteError}</p> : null}
            
            <div className="border-t border-black/10 dark:border-white/10 my-1" />
            
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">Saved Routes</h3>
            {accountCommutes.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">No saved account commutes yet.</p>
            ) : (
              accountCommutes.map((commute) => {
                const stopsExpanded = expandedCommuteId === commute.id;
                const routeStops = commute.path.stationIds;
                const canViewPath = commute.path.status === "available" && commute.path.segmentIds.length > 0;
                const viewingPath = viewedCommuteId === commute.id;

                return (
                  <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{commute.label}</h3>
                        <span className={`status-pill ${commuteTone(commute)}`}>{commute.impact.statusLabel}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">{commute.routeLabel}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 whitespace-normal break-words">{routeSummary(commute)}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 whitespace-normal break-words">{commute.impact.detail}</p>
                      {commute.impact.matchedImpacts.length > 0 ? (
                        <ul className="saved-commute-impact-list">
                          {commute.impact.matchedImpacts.slice(0, 3).map((impact) => (
                            <li key={`${impact.kind}-${impact.id}`} className="!flex !flex-row !items-center !gap-1.5 !flex-wrap">
                              <ImpactIcon kind={impact.kind} className="shrink-0" />
                              <strong className="font-bold uppercase tracking-wider text-[10px] text-slate-700 dark:text-slate-300">
                                {impactKindLabel(impact.kind)}
                              </strong>
                              <span className="text-slate-700 dark:text-slate-300 -ml-1 mr-0.5">:</span>
                              <span className="text-slate-600 dark:text-slate-400">
                                {impactLineLabel(impact)}{impact.location ? `: ${impact.location}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="commute-route-actions">
                        <button
                          type="button"
                          className="commute-route-stop-toggle"
                          onClick={() => setExpandedCommuteId((current) => current === commute.id ? null : commute.id)}
                          aria-expanded={stopsExpanded}
                          aria-controls={`commute-stops-${commute.id}`}
                          disabled={routeStops.length === 0}
                        >
                          <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${stopsExpanded ? "rotate-180" : ""}`} />
                          {stopsExpanded ? "Hide stops" : `View ${routeStops.length} stops`}
                        </button>
                        <button
                          type="button"
                          className="commute-route-map-button"
                          onClick={() => onViewPath(commute)}
                          disabled={!canViewPath}
                          aria-pressed={viewingPath}
                        >
                          <MapPinned size={14} aria-hidden="true" />
                          {viewingPath ? "Viewing path" : "View path on map"}
                        </button>
                        {deletingCommuteId === commute.id ? (
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mr-1">Are you sure?</span>
                            <button
                              type="button"
                              className="commute-route-delete-confirm-button"
                              onClick={() => {
                                handleDeleteCommute(commute.id);
                                setDeletingCommuteId(null);
                              }}
                              aria-label={`Confirm delete saved commute ${commute.label}`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="commute-route-delete-cancel-button"
                              onClick={() => setDeletingCommuteId(null)}
                              aria-label={`Cancel delete saved commute ${commute.label}`}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="commute-route-delete-button"
                            onClick={() => setDeletingCommuteId(commute.id)}
                            aria-label={`Delete saved commute ${commute.label}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {stopsExpanded ? (
                        <ol id={`commute-stops-${commute.id}`} className="commute-route-stop-list" aria-label={`Stops for ${commute.label}`}>
                          {routeStops.map((stationId, index) => (
                            <li key={`${commute.id}-${stationId}-${index}`}>
                              <span className="commute-route-stop-index">{index + 1}</span>
                              <span>{stationNameFor(stationId)}</span>
                              {commute.path.transferStationIds.includes(stationId) ? (
                                <strong>Transfer</strong>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
