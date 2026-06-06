"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation, ChevronLeft } from "lucide-react";
import {
  createSavedCommute,
  deleteSavedCommute,
  getSavedCommutes,
  type AccountSavedCommute,
  type AccountState,
  type AccountMatchedImpact,
} from "../app/account-data";
import type { StationSummary } from "../app/station-data";

interface Props {
  onBack?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationSummaries: StationSummary[];
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

function impactKindLabel(kind: AccountMatchedImpact["kind"]) {
  switch (kind) {
    case "reduced-speed-zone":
      return "RSZ";
    case "planned-closure":
      return "Planned";
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
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationSummaries,
  onRequestSignIn,
  onRequestCreateAccount,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);

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

  const stationOptions = useMemo(() => {
    return [...stationSummaries].sort((a, b) => a.name.localeCompare(b.name));
  }, [stationSummaries]);

  const handleCreateCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
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
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };

  return (
    <section className="commute-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3">
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
      </div>
      <div className="commute-grid min-w-0 p-3 flex flex-col gap-3">
        {!accountState.authenticated ? (
          <div className="saved-commute-account-prompt">
            <strong>Account required</strong>
            <span>Sign in or create an account to view saved commutes.</span>
            <div className="account-action-row">
              <button type="button" onClick={onRequestSignIn}>Sign in</button>
              <button type="button" onClick={onRequestCreateAccount}>Create account</button>
            </div>
          </div>
        ) : null}

        {accountState.authenticated ? (
          <div className="saved-commute-form">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{accountState.user?.demo ? "Demo account" : "Saved to account"}</strong>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Route impacts enabled</span>
            </div>
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Commute label" aria-label="Saved commute label" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select value={originStationId} onChange={(event) => setOriginStationId(event.target.value)} aria-label="Origin station">
                <option value="">Origin station</option>
                {stationOptions.map((station) => <option key={`origin-${station.id}`} value={station.id}>{station.name}</option>)}
              </select>
              <select value={destinationStationId} onChange={(event) => setDestinationStationId(event.target.value)} aria-label="Destination station">
                <option value="">Destination station</option>
                {stationOptions.map((station) => <option key={`destination-${station.id}`} value={station.id}>{station.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={handleCreateCommute} disabled={saving}>Save commute</button>
            {commuteError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{commuteError}</p> : null}
            {accountCommutes.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">No saved account commutes yet.</p>
            ) : (
              accountCommutes.map((commute) => (
                <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                  <div className="flex items-start justify-between gap-3">
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
                            <li key={`${impact.kind}-${impact.id}`}>
                              <strong>{impactKindLabel(impact.kind)}</strong>
                              <span>{impactLineLabel(impact)}{impact.location ? `: ${impact.location}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => handleDeleteCommute(commute.id)} aria-label={`Delete saved commute ${commute.label}`}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
