"use client";

import { useMemo, useState } from "react";
import { Navigation, ChevronDown, ChevronLeft, Loader2, MapPinned, X, AlertTriangle, Construction, Calendar, Clock, Bell } from "lucide-react";
import {
  createSavedCommute,
  deleteSavedCommute,
  commuteLegsForCommute,
  commutePathPreviewFromCommute,
  type AccountSavedCommute,
  type AccountState,
  type AccountMatchedImpact,
  type AccountCommuteLeg,
  type AccountCommuteLegId,
  type AccountCommuteImpact,
} from "../app/account-data";
import type { StationSummary } from "../app/station-data";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
import { DelayIcon } from "./DelayIcon";

function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      // If there are no letters at all, preserve the word as-is (e.g. "->")
      if (!/[a-zA-Z]/.test(word)) {
        return word;
      }
      return word
        .split("-")
        .map((subWord) => {
          if (!subWord) return "";
          const cleanWord = subWord.replace(/[^a-zA-Z]/g, "").toLowerCase();
          let formatted: string;
          if (cleanWord === "linewatch") {
            formatted = subWord.replace(/linewatch/i, "LineWatch");
          } else if (cleanWord === "ttc") {
            formatted = subWord.replace(/ttc/i, "TTC");
          } else if (cleanWord === "lrt") {
            formatted = subWord.replace(/lrt/i, "LRT");
          } else {
            formatted = subWord.charAt(0).toUpperCase() + subWord.slice(1).toLowerCase();
          }
          return formatted;
        })
        .join("-");
    })
    .join(" ");
}

function NumStationsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor">
      <g>
        <path d="M349.917,432.716v-0.635H162.472v0.635h-10.544L89.982,512h45.644l13.705-20.233h213.334L376.367,512h45.659l-61.95-79.284H349.917z M162.558,472.248l13.988-20.648h158.912l13.988,20.648H162.558z" />
        <path d="M256.002,0C112.749,0,71.397,51.982,71.397,91.663v258.601c0,34.895,28.29,63.216,63.224,63.216h242.765c34.942,0,63.217-28.321,63.217-63.216V91.663C440.603,51.982,399.259,0,256.002,0z M189.091,56.987h133.815c8.888,0,16.106,7.21,16.106,16.098c0,8.912-7.218,16.114-16.106,16.114H189.091c-8.889,0-16.098-7.202-16.098-16.114C172.992,64.197,180.201,56.987,189.091,56.987z M160.275,358.439c-11.093,0-20.084-8.991-20.084-20.084c0-11.094,8.991-20.084,20.084-20.084c11.093,0,20.084,8.99,20.084,20.084C180.358,349.448,171.368,358.439,160.275,358.439z M241.943,239.278H134.731v-98.064h107.212V239.278z M351.737,358.439c-11.094,0-20.084-8.991-20.084-20.084c0-11.094,8.99-20.084,20.084-20.084c11.092,0,20.084,8.99,20.084,20.084C371.821,349.448,362.829,358.439,351.737,358.439z M382.047,239.278H270.061v-98.064h111.986V239.278z" />
      </g>
    </svg>
  );
}

function ExclaimAlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-0.5 0 25 25" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M10.8809 16.15C10.8809 16.0021 10.9101 15.8556 10.967 15.7191C11.024 15.5825 11.1073 15.4586 11.2124 15.3545C11.3175 15.2504 11.4422 15.1681 11.5792 15.1124C11.7163 15.0567 11.8629 15.0287 12.0109 15.03C12.2291 15.034 12.4413 15.1021 12.621 15.226C12.8006 15.3499 12.9399 15.5241 13.0211 15.7266C13.1024 15.9292 13.122 16.1512 13.0778 16.3649C13.0335 16.5786 12.9272 16.7745 12.7722 16.9282C12.6172 17.0818 12.4204 17.1863 12.2063 17.2287C11.9922 17.2711 11.7703 17.2494 11.5685 17.1663C11.3666 17.0833 11.1938 16.9426 11.0715 16.7618C10.9492 16.5811 10.8829 16.3683 10.8809 16.15ZM11.2408 13.42L11.1008 8.20001C11.0875 8.07453 11.1008 7.94766 11.1398 7.82764C11.1787 7.70761 11.2424 7.5971 11.3268 7.5033C11.4112 7.40949 11.5144 7.33449 11.6296 7.28314C11.7449 7.2318 11.8697 7.20526 11.9958 7.20526C12.122 7.20526 12.2468 7.2318 12.3621 7.28314C12.4773 7.33449 12.5805 7.40949 12.6649 7.5033C12.7493 7.5971 12.813 7.70761 12.8519 7.82764C12.8909 7.94766 12.9042 8.07453 12.8909 8.20001L12.7609 13.42C12.7609 13.6215 12.6809 13.8149 12.5383 13.9574C12.3958 14.0999 12.2024 14.18 12.0009 14.18C11.7993 14.18 11.606 14.0999 11.4635 13.9574C11.321 13.8149 11.2408 13.6215 11.2408 13.42Z" fill="currentColor" />
      <path d="M12 21.5C17.1086 21.5 21.25 17.3586 21.25 12.25C21.25 7.14137 17.1086 3 12 3C6.89137 3 2.75 7.14137 2.75 12.25C2.75 17.3586 6.89137 21.5 12 21.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// drawer-layout.test.mjs compatibility: grid-cols-1

interface Props {
  onBack?: () => void;
  onClose?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationSummaries: StationSummary[];
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute, legId?: AccountCommuteLegId) => void;
  onClearViewedPath: (commuteId: string) => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
}

function severityPriority(severity: AccountCommuteImpact["severity"]) {
  switch (severity) {
    case "suspended":
      return 5;
    case "major":
      return 4;
    case "minor":
      return 3;
    case "planned":
      return 2;
    case "unavailable":
      return 1;
    case "clear":
    default:
      return 0;
  }
}

function commuteLegs(commute: AccountSavedCommute) {
  return commuteLegsForCommute(commute);
}

function commuteWorstSeverity(commute: AccountSavedCommute) {
  return commuteLegs(commute)
    .map((leg) => leg.impact.severity)
    .sort((a, b) => severityPriority(b) - severityPriority(a))[0] ?? "clear";
}

function commuteTone(commute: AccountSavedCommute) {
  switch (commuteWorstSeverity(commute)) {
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

function commuteStatusLabel(commute: AccountSavedCommute) {
  const legs = commuteLegs(commute);
  if (legs.length === 1) {
    return legs[0].impact.statusLabel;
  }
  const outboundStatus = legs.find((leg) => leg.id === "outbound")?.impact.status ?? "clear";
  const returnStatus = legs.find((leg) => leg.id === "return")?.impact.status ?? "clear";
  if (outboundStatus === "affected" && returnStatus === "affected") return "Both affected";
  if (outboundStatus === "affected") return "Outbound affected";
  if (returnStatus === "affected") return "Return affected";
  if (outboundStatus === "planned" && returnStatus === "planned") return "Both planned";
  if (outboundStatus === "planned") return "Outbound planned";
  if (returnStatus === "planned") return "Return planned";
  if (outboundStatus === "unavailable" && returnStatus === "unavailable") return "Route unavailable";
  return "Clear both ways";
}

function currentImpactCount(legs: AccountCommuteLeg[]) {
  return legs.flatMap((leg) => leg.impact.matchedImpacts).filter((impact) => impact.status === "current").length;
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
      return <DelayIcon className={`delay-tone ${className || ""}`} size={14} filled={false} />;
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

function SavedCommuteNotificationSummary({
  onOpenNotificationSettings,
  notificationSummary,
}: {
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
}) {
  const summary = notificationSummary || {
    label: "Unavailable",
    detail: "Saved commute alerts and closure reminders",
    tone: "unavailable",
  };

  return (
    <div className="saved-commute-notification-summary">
      <div className="saved-commute-notification-summary-copy">
        <Bell size={15} className={`shrink-0 ${summary.tone === "on" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`} aria-hidden="true" />
        <span>
          <strong>Notifications: {summary.label}</strong>
          <em>{summary.detail}</em>
        </span>
      </div>
      <button type="button" onClick={onOpenNotificationSettings}>
        Manage
      </button>
    </div>
  );
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
  onOpenNotificationSettings,
  notificationSummary,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [watchReturnTrip, setWatchReturnTrip] = useState(true);
  const [expandedCommuteId, setExpandedCommuteId] = useState<string | null>(null);
  const [deletingCommuteId, setDeletingCommuteId] = useState<string | null>(null);
  const [selectedLegIds, setSelectedLegIds] = useState<Record<string, AccountCommuteLegId>>({});
  const [activePicker, setActivePicker] = useState<"origin" | "destination" | null>(null);

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
        watchReturnTrip,
      });
      setAccountCommutes([...accountCommutes, created]);
      setNewLabel("");
      setOriginStationId("");
      setDestinationStationId("");
      setWatchReturnTrip(true);
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
            <button
              onClick={() => {
                if (activePicker) {
                  setActivePicker(null);
                } else {
                  onBack();
                }
              }}
              className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            >
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
            onClick={() => {
              if (activePicker) {
                setActivePicker(null);
              } else {
                onClose();
              }
            }}
            className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        )}
      </div>
      <div className="commute-grid min-w-0 p-3 flex flex-col gap-3">
        {!accountState.authenticated ? (
          <div className="saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-black/10 dark:border-white/10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M18.9922 8.07411C18.7683 8.30212 18.5423 8.50328 18.3375 8.67188C18.1401 8.50899 17.9227 8.31226 17.7078 8.08774C16.9853 7.333 16.5 6.48786 16.5 5.6875C16.5 4.59138 17.3653 3.75 18.375 3.75C19.3847 3.75 20.25 4.59138 20.25 5.6875C20.25 6.46225 19.7514 7.30076 18.9922 8.07411ZM21.75 5.6875C21.75 8.4375 18.375 10.5 18.375 10.5C18.2063 10.5 15 8.4375 15 5.6875C15 3.78902 16.511 2.25 18.375 2.25C20.239 2.25 21.75 3.78902 21.75 5.6875ZM3.75 9C3.75 10.2426 4.75736 11.25 6 11.25H18C20.0711 11.25 21.75 12.9289 21.75 15C21.75 17.0711 20.0711 18.75 18 18.75H9.75V17.25H18C19.2426 17.25 20.25 16.2426 20.25 15C20.25 13.7574 19.2426 12.75 18 12.75H6C3.92893 12.75 2.25 11.0711 2.25 9C2.25 6.92893 3.92893 5.25 6 5.25L14.25 5.25V6.75L6 6.75C4.75736 6.75 3.75 7.75736 3.75 9ZM6.24215 19.3241C6.01829 19.5521 5.79234 19.7533 5.58752 19.9219C5.39011 19.759 5.1727 19.5623 4.95777 19.3377C4.23528 18.583 3.75 17.7379 3.75 16.9375C3.75 15.8414 4.61529 15 5.625 15C6.63471 15 7.5 15.8414 7.5 16.9375C7.5 17.7123 7.00145 18.5508 6.24215 19.3241ZM9 16.9375C9 19.6875 5.625 21.75 5.625 21.75C5.45625 21.75 2.25 19.6875 2.25 16.9375C2.25 15.039 3.76104 13.5 5.625 13.5C7.48896 13.5 9 15.039 9 16.9375ZM6.75 16.875C6.75 17.4963 6.24632 18 5.625 18C5.00368 18 4.5 17.4963 4.5 16.875C4.5 16.2537 5.00368 15.75 5.625 15.75C6.24632 15.75 6.75 16.2537 6.75 16.875ZM18.375 6.75C18.9963 6.75 19.5 6.24632 19.5 5.625C19.5 5.00368 18.9963 4.5 18.375 4.5C17.7537 4.5 17.25 5.00368 17.25 5.625C17.25 6.24632 17.7537 6.75 18.375 6.75Z"
                    fill="currentColor"
                  />
                </svg>
                Track Your Daily Commute
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Unlock personalized tracking and push notifications for your daily subway and LRT routes.
              </p>
            </div>

            <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Personalized Route Pathing</span>
                  <span className="text-slate-500 dark:text-slate-400">Save custom origin-destination pairs on subway Lines 1, 2, 4 and LRT Lines 5, 6.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Direction-Aware Impact Matching</span>
                  <span className="text-slate-500 dark:text-slate-400">Only get alerted for service disruptions that actually lie in your path and travel direction.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Return Leg Monitoring</span>
                  <span className="text-slate-500 dark:text-slate-400">Easily toggle and monitor your reverse return leg in the same view.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Instant Browser Push Notifications</span>
                  <span className="text-slate-500 dark:text-slate-400">Receive live push alerts the moment a delay, suspension, or planned closure impacts your commute.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Free</span>
                </div>
              </div>
            </div>

            <div className="account-action-row mt-1">
              <button type="button" onClick={onRequestSignIn}>Sign In</button>
              <button type="button" onClick={onRequestCreateAccount} className="saved-commute-signup-btn">Create Account</button>
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
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Enter a Commute Label (e.g. Work)" aria-label="Saved commute label" />
            <div className="saved-commute-station-grid">
              <SavedCommuteStationPicker
                label="Origin"
                placeholder="Origin Station"
                value={originStationId}
                stations={stationSummaries}
                blockedStationId={destinationStationId || undefined}
                blockedLabel="Already selected as destination"
                onChange={setOriginStationId}
                isOpen={activePicker === "origin"}
                onOpenChange={(open) => setActivePicker(open ? "origin" : null)}
              />
              <SavedCommuteStationPicker
                label="Destination"
                placeholder="Destination Station"
                value={destinationStationId}
                stations={stationSummaries}
                blockedStationId={originStationId || undefined}
                blockedLabel="Already selected as origin"
                onChange={setDestinationStationId}
                isOpen={activePicker === "destination"}
                onOpenChange={(open) => setActivePicker(open ? "destination" : null)}
              />
            </div>
            <label className="saved-commute-return-toggle">
              <div className="saved-commute-switch">
                <input
                  type="checkbox"
                  checked={watchReturnTrip}
                  onChange={(event) => setWatchReturnTrip(event.target.checked)}
                />
                <span className="saved-commute-slider"></span>
              </div>
              <span>Track Return Route</span>
            </label>
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

            <SavedCommuteNotificationSummary
              onOpenNotificationSettings={onOpenNotificationSettings}
              notificationSummary={notificationSummary}
            />
            
            <div
              aria-hidden="true"
              className="station-arrival-line-divider my-3 mx-0.5"
            />
            
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">Saved Routes</h3>
            {accountCommutes.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">No saved account commutes yet.</p>
            ) : (
              accountCommutes.map((commute) => {
                const legs = commuteLegs(commute);
                const selectedLegId = selectedLegIds[commute.id] ?? "outbound";
                const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? legs[0];
                const stopsExpanded = expandedCommuteId === commute.id;
                const routeStops = selectedLeg.path.stationIds;
                const canViewPath = selectedLeg.path.status === "available" && selectedLeg.path.segmentIds.length > 0;
                const selectedPreview = commutePathPreviewFromCommute(commute, selectedLeg.id);
                const viewingPath = Boolean(selectedPreview && viewedCommuteId === selectedPreview.id);
                const routeLabel = commute.watchReturnTrip
                  ? `${commute.originStationName} <-> ${commute.destinationStationName}`
                  : commute.routeLabel;

                return (
                  <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                            {toTitleCase(commute.label.replace(/\bto\b/g, "->"))}
                          </h3>
                          <span className={`status-pill ${commuteTone(commute)}`}>{toTitleCase(commuteStatusLabel(commute))}</span>
                        </div>
                        {(() => {
                          const currentImpactsCount = currentImpactCount(legs);
                          const hasCurrentImpacts = currentImpactsCount > 0;
                          const impactBgColor = hasCurrentImpacts
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60";
                          const impactText = currentImpactsCount === 0
                            ? "No Impacts"
                            : `${currentImpactsCount} Impact${currentImpactsCount === 1 ? "" : "s"}`;
                          return (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${impactBgColor}`}>
                              <ExclaimAlertIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>{impactText}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{routeLabel}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">Origin:</span>
                          <span className="text-slate-800 dark:text-white">{commute.originStationName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">Destination:</span>
                          <span className="text-slate-800 dark:text-white">{commute.destinationStationName}</span>
                        </div>
                      </div>

                      {legs.length > 1 ? (
                        <div className="commute-leg-toggle" role="tablist" aria-label={`Route direction for ${commute.label}`}>
                          {legs.map((leg) => {
                            const isClear = leg.impact.severity === "clear";
                            return (
                              <button
                                key={leg.id}
                                type="button"
                                role="tab"
                                aria-selected={selectedLeg.id === leg.id}
                                className={isClear ? "leg-btn-clear" : "leg-btn-affected"}
                                onClick={() => setSelectedLegIds((current) => ({ ...current, [commute.id]: leg.id }))}
                              >
                                To {leg.toStationName}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-2">
                        Default Scheduled Route - To {selectedLeg.toStationName}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-white font-medium">
                        <div className="flex items-center gap-1.5">
                          <NumStationsIcon className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>
                            {toTitleCase(`${selectedLeg.path.stationIds.length} Station${selectedLeg.path.stationIds.length === 1 ? "" : "s"}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-white shrink-0" />
                          <span>
                            {selectedLeg.path.status === "available"
                              ? toTitleCase(`About ${Math.max(1, Math.round(selectedLeg.path.estimatedTravelSeconds / 60.0))} Minutes`)
                              : toTitleCase("Route path unavailable")}
                          </span>
                        </div>
                      </div>

                      <ul className="saved-commute-leg-list">
                        {(() => {
                          const leg = selectedLeg;
                          const firstImpact = leg.impact.matchedImpacts[0];
                          return (
                            <li key={leg.id} className={`saved-commute-leg-row ${leg.impact.severity === "clear" ? "clear-tint" : "affected-tint"}`}>
                              <strong className={leg.impact.severity === "clear" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                                {toTitleCase(leg.impact.statusLabel)}
                              </strong>
                              {firstImpact ? (
                                <em>{toTitleCase(impactKindLabel(firstImpact.kind))}{firstImpact.displayDirection ? ` ${toTitleCase(firstImpact.displayDirection)}` : ""}</em>
                              ) : (
                                <em>No Matching Impacts</em>
                              )}
                            </li>
                          );
                        })()}
                      </ul>

                      {selectedLeg.impact.matchedImpacts.length > 0 ? (
                        <ul className="saved-commute-impact-list">
                          {selectedLeg.impact.matchedImpacts.slice(0, 3).map((impact) => (
                            <li key={`${impact.kind}-${impact.id}`} className="!flex !flex-row !items-center !gap-1.5 !flex-wrap">
                              <ImpactIcon kind={impact.kind} className="shrink-0" />
                              <strong className="font-bold uppercase tracking-wider text-[10px] text-slate-700 dark:text-slate-300">
                                {toTitleCase(impactKindLabel(impact.kind))}
                              </strong>
                              <span className="text-slate-700 dark:text-slate-300 -ml-1 mr-0.5">:</span>
                              <span className="text-slate-600 dark:text-slate-400">
                                {toTitleCase(impactLineLabel(impact))}{impact.location ? `: ${toTitleCase(impact.location)}` : ""}
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
                          onClick={() => onViewPath(commute, selectedLeg.id)}
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
                              {selectedLeg.path.transferStationIds.includes(stationId) ? (
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
