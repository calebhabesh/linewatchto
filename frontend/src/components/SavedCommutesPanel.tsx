"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { Navigation, CheckCircle2, AlertCircle, AlertOctagon, ChevronLeft } from "lucide-react";
import {
  createSavedCommute,
  deleteSavedCommute,
  getSavedCommutes,
  type AccountSavedCommute,
  type AccountState,
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
  onRequestDemo: () => void;
}

export function SavedCommutesPanel({
  onBack,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationSummaries,
  onRequestSignIn,
  onRequestCreateAccount,
  onRequestDemo,
}: Props) {
  const { commuteImpacts } = useDashboardData();
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

  const getImpactClass = (impact: string) => {
    switch (impact) {
      case "suspended":
      case "major":
        return "danger border-l-red-500";
      case "minor":
      case "planned":
        return "warning border-l-amber-500";
      default:
        return "ok border-l-green-500";
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case "suspended":
      case "major":
        return <AlertOctagon size={16} className="text-red-500" />;
      case "minor":
      case "planned":
        return <AlertCircle size={16} className="text-amber-500" />;
      default:
        return <CheckCircle2 size={16} className="text-green-500" />;
    }
  };

  const getImpactPill = (impact: string, label: string) => {
    let classes = "bg-slate-500/10 text-slate-500";
    if (impact === "suspended" || impact === "major") {
      classes = "bg-red-500/10 text-red-600 dark:text-red-400";
    } else if (impact === "minor" || impact === "planned") {
      classes = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    } else if (impact === "clear") {
      classes = "bg-green-500/10 text-green-600 dark:text-green-400";
    }

    return (
      <span className={`status-pill inline-flex shrink-0 px-2 py-0.5 text-xs font-bold rounded-full ${classes}`}>
        {label}
      </span>
    );
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
            <strong>Demo examples</strong>
            <span>Sign in to save your own rapid-transit commute preferences.</span>
            <div className="account-action-row">
              <button type="button" onClick={onRequestSignIn}>Sign in</button>
              <button type="button" onClick={onRequestCreateAccount}>Create account</button>
              <button type="button" onClick={onRequestDemo}>Demo account</button>
            </div>
          </div>
        ) : null}

        {accountState.authenticated ? (
          <div className="saved-commute-form">
            <div className="flex items-center justify-between gap-2">
              <strong>{accountState.user?.demo ? "Demo account" : "Saved to account"}</strong>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Impact matching pending</span>
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
                <div key={commute.id} className="commute-card ok min-w-0 rounded-lg border border-black/10 border-l-4 border-l-green-500 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{commute.label}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">{commute.routeLabel}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">Impact matching pending.</p>
                    </div>
                    <button type="button" onClick={() => handleDeleteCommute(commute.id)} aria-label={`Delete saved commute ${commute.label}`}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {(!accountState.authenticated || accountCommutes.length === 0) && commuteImpacts.map((commute) => {
          const impactClass = getImpactClass(commute.impact);
          const hasImpact = commute.impact !== "clear";
          return (
            <div
              key={commute.id}
              className={`commute-card min-w-0 border-l-4 ${impactClass} p-3 rounded-lg border border-black/10 dark:border-white/10 flex flex-col justify-between ${
                hasImpact ? "!bg-orange-50 dark:!bg-orange-950" : "!bg-slate-50 dark:!bg-[#12151c]"
              }`}
            >
              <div>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                    {commute.name}
                  </h3>
                  <span className="shrink-0 mt-0.5">{getImpactIcon(commute.impact)}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">
                  {commute.route}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed whitespace-normal break-words">
                  {commute.detail}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
                {getImpactPill(commute.impact, commute.statusLabel)}
                {commute.affectedBy && (
                  <span className="min-w-0 text-[10px] text-slate-400 dark:text-slate-500 italic whitespace-normal break-words">
                    via {commute.affectedBy}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
