"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Construction,
  Loader2,
  Navigation,
  TrainFront,
  X,
} from "lucide-react";
import {
  type AccountState,
} from "../app/account-data";
import { type UsePushNotificationSettingsResult } from "../hooks/usePushNotificationSettings";
import { DelayIcon } from "./DelayIcon";

type Props = {
  accountState: AccountState;
  pushSettings: UsePushNotificationSettingsResult;
  onBack?: () => void;
  onClose?: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
};

// Mapped line options for tests: Line 1, Line 2, Line 4, Line 5, Line 6
const LINE_COLORS: Record<string, string> = {
  "line-1": "#FBD13F",
  "line-2": "#00843D",
  "line-4": "#B241A1",
  "line-5": "#F58220",
  "line-6": "#969594",
};

function NotificationSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="saved-commute-return-toggle notification-settings-toggle shrink-0">
      <div className="saved-commute-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
        />
        <span className="saved-commute-slider"></span>
      </div>
    </label>
  );
}

export function NotificationSettingsPanel({
  accountState,
  pushSettings,
  onBack,
  onClose,
  onRequestSignIn,
  onRequestCreateAccount,
}: Props) {
  const {
    supported,
    config,
    preferences,
    subscribed,
    busy,
    message,
    browserStatus,
    enableDeviceNotifications,
    disableDeviceNotifications,
    updatePreferences,
  } = pushSettings;

  const statusMessage = useMemo(() => {
    if (message) return message;
    switch (browserStatus) {
      case "unsupported":
        return "Push unavailable on this browser.";
      case "not-configured":
        return "Push not configured for this environment.";
      case "blocked":
        return "Notifications are blocked in browser settings.";
      case "checking":
        return "Checking push support...";
      case "off":
        return "Push for this browser is off.";
      case "on":
        return "Push for this browser is enabled.";
      default:
        return null;
    }
  }, [message, browserStatus]);

  return (
    <section className="notification-settings-panel panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" aria-label="Notification settings">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack ? (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Back">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          ) : null}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
            <Bell className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" aria-hidden="true" />
            <span>Notifications</span>
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
        {!accountState.authenticated ? (
          <div className="notification-settings-prompt">
            <strong>Account Required</strong>
            <span>Sign in or create an account to manage saved-commute notification settings.</span>
            <div className="account-action-row">
              <button type="button" onClick={onRequestSignIn}>Sign In</button>
              <button type="button" onClick={onRequestCreateAccount}>Create Account</button>
            </div>
          </div>
        ) : null}

        {accountState.authenticated ? (
          <>
            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Device Notifications</h3>
                <span>{subscribed ? "Enabled" : "Off"}</span>
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2 relative">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <Bell size={17} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>
                      <strong>Push for This Browser</strong>
                      <em>Controls whether this phone or browser can display LineWatch TO notifications.</em>
                    </span>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={subscribed}
                      disabled={busy || !supported || !config?.webPushAvailable}
                      label="Push for this browser"
                      onChange={(checked) => {
                        if (checked) {
                          enableDeviceNotifications();
                        } else {
                          disableDeviceNotifications();
                        }
                      }}
                    />
                  </div>
                </div>
                {busy ? (
                  <p className="notification-settings-message text-slate-500 dark:text-slate-400 flex items-center gap-1.5" role="status">
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Updating notification settings...
                  </p>
                ) : statusMessage ? (
                  <p className="notification-settings-message text-slate-700 dark:text-slate-300" role="status">{statusMessage}</p>
                ) : null}
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Saved Commute Alerts</h3>
                <span>Active</span>
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <Navigation size={17} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>
                      <strong>Current Disruptions Affecting Saved Commutes</strong>
                      <em>Delays, suspensions, Reduced Speed Zones, and cleared updates only when they affect a saved route.</em>
                    </span>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={preferences.savedCommutes.currentDisruptions}
                      disabled={busy}
                      label="Current disruptions affecting saved commutes"
                      onChange={(checked) => {
                        updatePreferences({
                          ...preferences,
                          savedCommutes: {
                            ...preferences.savedCommutes,
                            currentDisruptions: checked,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                {!subscribed && (
                  <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic">
                    Inactive until device notifications are enabled for at least one browser.
                  </p>
                )}
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2 mt-2">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <Calendar size={17} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span>
                      <strong>Planned Closure Reminders</strong>
                      <em>Upcoming closure notices for monitored saved-commute routes.</em>
                    </span>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={preferences.savedCommutes.plannedClosureReminders}
                      disabled={busy}
                      label="Planned closure reminders"
                      onChange={(checked) => {
                        updatePreferences({
                          ...preferences,
                          savedCommutes: {
                            ...preferences.savedCommutes,
                            plannedClosureReminders: checked,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                {!subscribed && (
                  <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic">
                    Inactive until device notifications are enabled for at least one browser.
                  </p>
                )}
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Line Subscriptions</h3>
                <span>Active</span>
              </div>
              <div className="notification-settings-list" aria-label="Line-wide notification subscriptions">
                {preferences.lineSubscriptions.lines.map((line) => {
                  const color = LINE_COLORS[line.lineId] || "#cccccc";
                  return (
                    <div className="notification-settings-row flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5 last:border-b-0" key={line.lineId}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="notification-line-badge shrink-0 w-6 h-6 flex items-center justify-center rounded-full font-bold text-sm"
                          style={{
                            backgroundColor: color,
                            color: line.lineId === "line-1" ? "#111827" : "#ffffff",
                          }}
                        >
                          {line.lineNumber}
                        </span>
                        <span className="notification-settings-row-label min-w-0 truncate">
                          <strong>Line {line.lineNumber}</strong>
                          <em>{line.label}</em>
                        </span>
                      </div>
                      <div className="notification-settings-row-actions">
                        <NotificationSwitch
                          checked={line.subscribed}
                          disabled={busy}
                          label={`Subscribe to Line ${line.lineNumber}`}
                          onChange={(checked) => {
                            const updatedLines = preferences.lineSubscriptions.lines.map((l) =>
                              l.lineId === line.lineId ? { ...l, subscribed: checked } : l
                            );
                            updatePreferences({
                              ...preferences,
                              lineSubscriptions: {
                                ...preferences.lineSubscriptions,
                                lines: updatedLines,
                              },
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Event Types</h3>
                <span>Filters</span>
              </div>
              <div className="notification-event-type-grid border border-black/10 dark:border-white/10 rounded-lg overflow-hidden bg-slate-50 dark:bg-black/25">
                <div className="notification-event-type-header grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 items-end border-b border-black/10 dark:border-white/10 font-bold text-xs text-slate-700 dark:text-slate-300">
                  <span>Event Type</span>
                  <span className="text-center">Saved Commutes</span>
                  <span className="text-center">Line Subs</span>
                </div>

                {[
                  {
                    key: "suspensions" as const,
                    label: "Suspensions / Closures",
                    icon: <AlertTriangle size={15} className="text-red-500" />,
                  },
                  {
                    key: "delays" as const,
                    label: "Delays",
                    icon: <DelayIcon size={15} filled={false} className="text-yellow-500" />,
                  },
                  {
                    key: "reducedSpeedZones" as const,
                    label: "Reduced Speed Zones",
                    icon: <Construction size={15} className="text-amber-500" />,
                  },
                  {
                    key: "plannedClosures" as const,
                    label: "Planned Closures",
                    icon: <Calendar size={15} className="text-blue-500" />,
                  },
                  {
                    key: "serviceRestored" as const,
                    label: "Service Restored Updates",
                    icon: <CheckCircle2 size={15} className="text-emerald-500" />,
                  },
                ].map(({ key, label, icon }) => (
                  <div className="notification-settings-control-grid grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2.5 items-center border-b border-black/5 dark:border-white/5 last:border-b-0" key={key}>
                    <span className="notification-settings-icon-label flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {icon}
                      <span>{label}</span>
                    </span>
                    <div className="flex justify-center">
                      <NotificationSwitch
                        checked={preferences.savedCommutes.eventTypes[key]}
                        disabled={busy}
                        label={`Saved commute ${label}`}
                        onChange={(checked) => {
                          updatePreferences({
                            ...preferences,
                            savedCommutes: {
                              ...preferences.savedCommutes,
                              eventTypes: {
                                ...preferences.savedCommutes.eventTypes,
                                [key]: checked,
                              },
                            },
                          });
                        }}
                      />
                    </div>
                    <div className="flex justify-center">
                      <NotificationSwitch
                        checked={preferences.lineSubscriptions.eventTypes[key]}
                        disabled={busy}
                        label={`Line subscription ${label}`}
                        onChange={(checked) => {
                          updatePreferences({
                            ...preferences,
                            lineSubscriptions: {
                              ...preferences.lineSubscriptions,
                              eventTypes: {
                                ...preferences.lineSubscriptions.eventTypes,
                                [key]: checked,
                              },
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Reminder Timing</h3>
                <span>Options</span>
              </div>
              <div className="notification-settings-list">
                {[
                  {
                    key: "onChange" as const,
                    label: "Event Starts/Changes",
                    icon: <Clock3 size={15} />,
                    desc: "Notify when disruptions start, significantly change, or clear.",
                  },
                  {
                    key: "closure24h" as const,
                    label: "24h Before Closure",
                    icon: <Calendar size={15} />,
                    desc: "Remind 24 hours before planned weekend or weekday closures.",
                  },
                  {
                    key: "closureMorning" as const,
                    label: "Morning of Closure",
                    icon: <TrainFront size={15} />,
                    desc: "Remind on the morning of a planned closure.",
                  },
                ].map(({ key, label, icon, desc }) => (
                  <div className="notification-settings-row flex items-center justify-between py-2.5 border-b border-black/5 dark:border-white/5 last:border-b-0" key={key}>
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="notification-settings-icon mt-0.5 shrink-0 text-slate-500 dark:text-slate-400">{icon}</span>
                      <span className="notification-settings-row-label min-w-0">
                        <strong>{label}</strong>
                        <em>{desc}</em>
                      </span>
                    </div>
                    <div className="notification-settings-row-actions">
                      <NotificationSwitch
                        checked={preferences.reminderTiming[key]}
                        disabled={busy}
                        label={label}
                        onChange={(checked) => {
                          updatePreferences({
                            ...preferences,
                            reminderTiming: {
                              ...preferences.reminderTiming,
                              [key]: checked,
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
