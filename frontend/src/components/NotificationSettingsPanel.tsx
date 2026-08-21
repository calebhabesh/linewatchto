"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  Construction,
  Loader2,
  Navigation,
  TrainFront,
  X,
} from "lucide-react";
import type { AccountState } from "../app/account-data";
import type { NetworkId } from "../app/regional-data";
import { type UsePushNotificationSettingsResult } from "../hooks/usePushNotificationSettings";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";

type Props = {
  accountState: AccountState;
  networkId: NetworkId;
  pushSettings: UsePushNotificationSettingsResult;
  onBack?: () => void;
  onClose?: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
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
  networkId,
  pushSettings,
  onBack,
  onClose,
  onRequestSignIn,
  onRequestCreateAccount,
}: Props) {
  const [subscriptionNetwork, setSubscriptionNetwork] = useState<NetworkId>(networkId);
  const {
    supported,
    config,
    preferences,
    subscribed,
    deviceNotificationsEnabled,
    busy,
    message,
    preferencesLoaded,
    enableDeviceNotifications,
    disableDeviceNotifications,
    updatePreferences,
    accountNotificationsDesired,
    deviceSetupState,
  } = pushSettings;
  const statusMessage = useMemo(() => {
    if (message) return message;
    switch (deviceSetupState) {
      case "unsupported":
        return "Push unavailable on this browser.";
      case "not-configured":
        return "Push not configured for this environment.";
      case "blocked":
        return "Notifications are blocked in browser settings.";
      case "checking":
        return "Checking push support...";
      case "restoring":
        return "Restoring notifications on this device...";
      case "needs-permission":
      case "needs-device-enable":
        return deviceNotificationsEnabled
          ? "Notifications are on. Reconnecting this device..."
          : "Account notifications are on. Enable this device to receive them here.";
      case "account-off":
        return "Account notification preferences are off.";
      case "enabled":
      case "signed-out":
      default:
        return null;
    }
  }, [message, deviceSetupState, deviceNotificationsEnabled]);
  const visibleLineSubscriptions = preferences.lineSubscriptions.lines.filter((line) =>
    subscriptionNetwork === "regional"
      ? line.lineId.startsWith("regional-")
      : !line.lineId.startsWith("regional-")
  );
  const enabledVisibleSubscriptionCount = visibleLineSubscriptions.filter((line) => line.subscribed).length;
  const regionalSubscriptionsVisible = subscriptionNetwork === "regional";

  return (
    <section className="notification-settings-panel panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" aria-label="Notification settings">
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
            <Bell className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" aria-hidden="true" />
            <span>Notifications</span>
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
        {accountState.source === "unavailable" ? (
          <AccountAvailabilityNotice knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null} />
        ) : !accountState.authenticated ? (
          <div className="account-feature-preview notification-settings-prompt !p-4 !flex !flex-col !gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
                <Bell className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                Enable Push Notifications
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Stay updated on TTC subway/LRT and GO/UP rail service changes without needing to check the app.
              </p>
            </div>

            <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">My Commute Impacts</span>
                  <span className="text-slate-500 dark:text-slate-400">Get notified the instant a delay, suspension, or slowdown affects your specific commute path.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Line-Wide Subscription Alerts</span>
                  <span className="text-slate-500 dark:text-slate-400">Subscribe to supported TTC lines or GO/UP corridors with customized event filters.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Planned Closure Reminders</span>
                  <span className="text-slate-500 dark:text-slate-400">Receive advance heads-up notifications for supported TTC and GO/UP planned closures and service updates.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Cross-Platform Push Delivery</span>
                  <span className="text-slate-500 dark:text-slate-400">Secure Web Push standard delivery to your mobile phone or web browser.</span>
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

        {accountState.source === "backend" && accountState.authenticated ? (
          <>
            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Device Notifications</h3>
                <span>{
                  deviceSetupState === "enabled" ? "Enabled" :
                  deviceSetupState === "restoring" ? "Restoring" :
                  deviceSetupState === "blocked" ? "Blocked" :
                  accountNotificationsDesired ? "Setup Needed" :
                  "Off"
                }</span>
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2 relative">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <span className="notification-settings-icon shrink-0">
                      <Bell size={15} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{deviceSetupState === "enabled" ? "This Device" : "Enable on This Device"}</strong>
                      <em>
                        {deviceSetupState === "enabled"
                          ? "This device is receiving notifications for the account preferences below."
                          : "Your account preferences are saved separately from this browser's push subscription."}
                      </em>
                      {busy ? (
                        <p className="notification-settings-message text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mt-1.5" role="status">
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Updating notification settings...
                        </p>
                      ) : statusMessage ? (
                        <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5" role="status">{statusMessage}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={deviceNotificationsEnabled}
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
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>My Commute Alerts</h3>
                <span>Active</span>
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <span className="notification-settings-icon shrink-0">
                      <Navigation size={15} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Current Disruptions Affecting My Commutes</strong>
                      <em>Delays, suspensions, planned closures, regional train cancellations, TTC Reduced Speed Zones, and cleared updates only when they affect a saved route.</em>
                      {!subscribed && accountNotificationsDesired ? (
                        <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
                          Account notifications are on. Enable this device to receive pushes here.
                        </p>
                      ) : null}
                      {!accountNotificationsDesired ? (
                        <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
                          Turn on at least one account notification stream to receive pushes.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={preferences.savedCommutes.currentDisruptions}
                      disabled={busy || !preferencesLoaded}
                      label="Current disruptions affecting My Commutes"
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
              </div>
              <div className="notification-settings-card border border-black/10 dark:border-white/10 p-3 rounded-lg flex flex-col gap-2 mt-2">
                <div className="flex items-start gap-2.5">
                  <div className="notification-settings-row-main flex-1">
                    <span className="notification-settings-icon shrink-0">
                      <PlannedClosureIcon size={15} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Planned Closure Reminders</strong>
                      <em>Upcoming closure notices for monitored saved-commute routes.</em>
                      {!subscribed && accountNotificationsDesired ? (
                        <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
                          Account notifications are on. Enable this device to receive pushes here.
                        </p>
                      ) : null}
                      {!accountNotificationsDesired ? (
                        <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
                          Turn on at least one account notification stream to receive pushes.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="notification-settings-row-actions">
                    <NotificationSwitch
                      checked={preferences.savedCommutes.plannedClosureReminders}
                      disabled={busy || !preferencesLoaded}
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
              </div>
            </div>

            <div className="notification-settings-section">
              <div className="notification-settings-section-header">
                <h3>Line &amp; Corridor Subscriptions</h3>
                <span>{enabledVisibleSubscriptionCount}/{visibleLineSubscriptions.length} On</span>
              </div>
              <div
                className="account-network-filter notification-network-filter"
                data-network={subscriptionNetwork}
                data-options-count="2"
                role="group"
                aria-label="Notification subscription network"
              >
                <span className="account-network-glider" aria-hidden="true" />
                <button
                  type="button"
                  aria-pressed={subscriptionNetwork === "ttc"}
                  onClick={() => setSubscriptionNetwork("ttc")}
                >
                  TTC
                </button>
                <button
                  type="button"
                  aria-pressed={subscriptionNetwork === "regional"}
                  onClick={() => setSubscriptionNetwork("regional")}
                >
                  GO &amp; UP
                </button>
              </div>
              <p className="notification-settings-note notification-network-note">
                {regionalSubscriptionsVisible
                  ? "Corridor alerts use fresh, supported GO/UP service disruptions. Trip changes, arrivals, accessibility outages, and service notices do not send corridor pushes."
                  : "Line alerts use fresh, dashboard-visible subway and LRT disruptions. Accessibility outages and streetcar or bus notices do not send line pushes."}
              </p>
              <div
                className="notification-settings-list"
                aria-label={regionalSubscriptionsVisible ? "GO and UP corridor notification subscriptions" : "TTC line notification subscriptions"}
              >
                {visibleLineSubscriptions.map((line) => {
                  const identity = regionalSubscriptionsVisible ? line.lineNumber : `Line ${line.lineNumber}`;
                  return (
                    <div className="notification-settings-row flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5 last:border-b-0" key={line.lineId}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TransitLineBadge lineId={line.lineId} lineNumber={line.lineNumber} lineName={line.label} size={26} className="notification-line-badge shrink-0" />
                        <span className="notification-settings-row-label min-w-0 truncate">
                          <strong>{identity}</strong>
                          <em>{line.label}</em>
                        </span>
                      </div>
                      <div className="notification-settings-row-actions">
                        <NotificationSwitch
                          checked={line.subscribed}
                          disabled={busy || !preferencesLoaded}
                          label={`Subscribe to ${identity} ${line.label}`}
                          onChange={(checked) => {
                            const updatedLines = preferences.lineSubscriptions.lines.map((item) =>
                              item.lineId === line.lineId ? { ...item, subscribed: checked } : item
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
                <span>Shared Filters</span>
              </div>
              <p className="notification-settings-note">
                These filters apply to My Commutes and every subscribed TTC line or GO/UP corridor. Reduced Speed Zones are TTC-only.
              </p>
              <div className="notification-event-type-grid border border-black/10 dark:border-white/10 rounded-lg overflow-hidden bg-slate-50 dark:bg-black/25">
                <div className="notification-event-type-header grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 items-end border-b border-black/10 dark:border-white/10 font-bold text-xs text-slate-700 dark:text-slate-300">
                  <span>Event Type</span>
                  <span className="text-center">My Commutes</span>
                  <span className="text-center">{regionalSubscriptionsVisible ? "Corridor Subs" : "Line Subs"}</span>
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
                    key: "tripCancellations" as const,
                    label: "Train Cancellations",
                    icon: <TrainFront size={15} className="text-red-500" />,
                  },
                  {
                    key: "reducedSpeedZones" as const,
                    label: "Reduced Speed Zones",
                    icon: <Construction size={15} className="text-amber-500" />,
                  },
                  {
                    key: "plannedClosures" as const,
                    label: "Planned Closures",
                    icon: <PlannedClosureIcon size={15} className="text-blue-500" />,
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
                        disabled={busy || !preferencesLoaded}
                        label={`My Commutes: ${label}`}
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
                        disabled={busy || !preferencesLoaded}
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
              <div className="notification-settings-section-header notification-follow-up-header">
                <h3>Planned Closure Follow-ups</h3>
                <span>Global</span>
              </div>
              <p className="notification-settings-note">
                New and meaningfully changed closures follow the stream and event filters above automatically. Choose if LineWatchTO should add one scheduled follow-up for My Commutes and line subscriptions.
              </p>
              <fieldset className="notification-follow-up-options" disabled={busy || !preferencesLoaded}>
                <legend className="sr-only">Planned closure follow-up policy</legend>
                {[
                  {
                    value: "smart" as const,
                    label: "Smart",
                    badge: "Recommended",
                    desc: "One useful follow-up: day-of for later closures, or within 24 hours for early-morning closures.",
                  },
                  {
                    value: "within-24-hours" as const,
                    label: "Within 24 Hours",
                    badge: null,
                    desc: "Once after the closure enters its final 24-hour window.",
                  },
                  {
                    value: "day-of" as const,
                    label: "Day Of",
                    badge: null,
                    desc: "Once after 6:00 AM Toronto time on the start date; My Commutes alerts still wait for their route window.",
                  },
                  {
                    value: "announcements-only" as const,
                    label: "Announcements Only",
                    badge: null,
                    desc: "Only when a closure is first reported or meaningfully updated—no scheduled follow-up.",
                  },
                ].map(({ value, label, badge, desc }) => (
                  <label
                    className="notification-follow-up-option"
                    data-selected={preferences.plannedClosureFollowUp === value}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="planned-closure-follow-up"
                      value={value}
                      checked={preferences.plannedClosureFollowUp === value}
                      onChange={() => {
                        if (preferences.plannedClosureFollowUp !== value) {
                          updatePreferences({
                            ...preferences,
                            plannedClosureFollowUp: value,
                          });
                        }
                      }}
                    />
                    <span className="notification-follow-up-copy">
                      <span className="notification-follow-up-title">
                        <strong>{label}</strong>
                        {badge ? <em>{badge}</em> : null}
                      </span>
                      <small>{desc}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
