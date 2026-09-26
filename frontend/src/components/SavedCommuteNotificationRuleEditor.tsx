"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Construction,
  Info,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Sunset,
  TrainFront,
} from "lucide-react";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import SquishSwitch from "./SquishSwitch";
import type {
  AccountSavedCommuteNotificationRule,
  AccountSavedCommuteNotificationSchedule,
} from "../app/commute-data.ts";
import { normalizeSavedCommuteNotificationRule } from "../app/commute-data.ts";
import type { NetworkId } from "../app/regional-data.ts";
import {
  NOTIFICATION_DAY_OPTIONS,
  notificationEventOptionsForNetwork,
  scopeNotificationRuleToNetwork,
  type NotificationScheduleKey,
  type NotificationScheduleMode,
  notificationScheduleMode,
  presetScheduleForMode,
  minuteToTimeValue,
  timeValueToMinute,
  formatScheduleSummary,
} from "../app/commute-notification-edit-model.ts";

export function NotificationEventIcon({
  eventType,
}: {
  eventType: keyof AccountSavedCommuteNotificationRule["eventTypes"];
}) {
  switch (eventType) {
    case "suspensions":
      return <AlertTriangle className="notification-event-icon suspension-tone" size={15} aria-hidden="true" />;
    case "delays":
      return <DelayIcon className="notification-event-icon delay-tone" size={15} filled={false} />;
    case "tripCancellations":
      return <TrainFront className="notification-event-icon suspension-tone" size={15} aria-hidden="true" />;
    case "reducedSpeedZones":
      return <Construction className="notification-event-icon rsz-tone" size={15} aria-hidden="true" />;
    case "plannedClosures":
      return <PlannedClosureIcon className="notification-event-icon planned-closure-tone" size={15} />;
    case "serviceRestored":
      return <CheckCircle2 className="notification-event-icon service-restored-tone" size={15} aria-hidden="true" />;
  }
}

export interface SavedCommuteNotificationRuleEditorProps {
  rule: AccountSavedCommuteNotificationRule;
  onChange: (rule: AccountSavedCommuteNotificationRule) => void;
  allowReturnLeg: boolean;
  networkId: NetworkId;
}

export function SavedCommuteNotificationRuleEditor({
  rule,
  onChange,
  allowReturnLeg,
  networkId,
}: SavedCommuteNotificationRuleEditorProps) {
  const [scheduleModes, setScheduleModes] = useState<Record<NotificationScheduleKey, NotificationScheduleMode>>(() => ({
    outboundSchedule: notificationScheduleMode(rule.outboundSchedule),
    returnSchedule: notificationScheduleMode(rule.returnSchedule),
  }));
  const [expandedSchedules, setExpandedSchedules] = useState<Record<NotificationScheduleKey, boolean>>({
    outboundSchedule: true,
    returnSchedule: true,
  });

  function updateRule(patch: Partial<AccountSavedCommuteNotificationRule>) {
    onChange(
      scopeNotificationRuleToNetwork(
        normalizeSavedCommuteNotificationRule({
          ...rule,
          ...patch,
          eventTypes: {
            ...rule.eventTypes,
            ...(patch.eventTypes ?? {}),
          },
        }),
        networkId,
      ),
    );
  }

  function updateSchedule(
    key: NotificationScheduleKey,
    patch: Partial<AccountSavedCommuteNotificationSchedule>,
  ) {
    onChange(
      scopeNotificationRuleToNetwork(
        normalizeSavedCommuteNotificationRule({
          ...rule,
          [key]: {
            ...rule[key],
            ...patch,
          },
        }),
        networkId,
      ),
    );
  }

  function renderLegSchedule(
    key: NotificationScheduleKey,
    label: string,
    enabled: boolean,
    available: boolean,
  ) {
    const schedule = rule[key];
    const controlsEnabled = rule.enabled && enabled && available;
    const mode = scheduleModes[key];
    const expanded = expandedSchedules[key];

    const setEnabled = (checked: boolean) => {
      updateRule(key === "outboundSchedule" ? { outboundEnabled: checked } : { returnEnabled: checked });
    };
    const setDay = (bit: number) => {
      const nextMask = (schedule.dayMask & bit) !== 0 ? schedule.dayMask & ~bit : schedule.dayMask | bit;
      updateSchedule(key, { dayMask: nextMask });
    };
    const selectMode = (nextMode: NotificationScheduleMode) => {
      setScheduleModes((current) => ({ ...current, [key]: nextMode }));
      const patch = presetScheduleForMode(nextMode, schedule, key);
      updateSchedule(key, patch);
    };

    return (
      <section className="saved-commute-schedule" data-enabled={controlsEnabled} key={key}>
        <div className="saved-commute-schedule-header">
          <label className="saved-commute-notification-leg-toggle" aria-disabled={!available}>
            <input
              type="checkbox"
              aria-label={`${label} notifications`}
              checked={enabled && available}
              disabled={!rule.enabled || !available}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <button
            type="button"
            className="saved-commute-schedule-disclosure"
            aria-label={`Configure ${label} schedule`}
            aria-expanded={expanded}
            aria-controls={`${key}-notification-controls`}
            onClick={() => setExpandedSchedules((current) => ({ ...current, [key]: !current[key] }))}
          >
            <span className="saved-commute-schedule-copy">
              <span className="saved-commute-route-label">
                {key === "outboundSchedule" ? (
                  <ArrowUpRight size={17} aria-hidden="true" />
                ) : (
                  <ArrowDownLeft size={17} aria-hidden="true" />
                )}
                <span>{label}</span>
              </span>
              <span className="saved-commute-schedule-summary">
                {enabled && available ? formatScheduleSummary(schedule) : "Off"}
              </span>
            </span>
            <ChevronDown className={expanded ? "is-open" : undefined} size={17} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
        {expanded ? (
          <div className="saved-commute-schedule-controls" id={`${key}-notification-controls`}>
            <div className="saved-commute-notification-segmented" role="group" aria-label={`${label} notification window`}>
              {([
                ["am-rush", "AM Rush", Sunrise],
                ["pm-rush", "PM Rush", Sunset],
                ["all-day", "Every Day", Sun],
                ["custom", "Custom", SlidersHorizontal],
              ] as const).map(([value, optionLabel, OptionIcon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={!controlsEnabled}
                  onClick={() => selectMode(value)}
                >
                  <OptionIcon size={14} aria-hidden="true" />
                  <span>{optionLabel}</span>
                </button>
              ))}
            </div>
            {mode === "custom" ? (
              <div className="saved-commute-custom-schedule">
                <strong>Days</strong>
                <div className="saved-commute-day-grid" role="group" aria-label={`${label} notification days`}>
                  {NOTIFICATION_DAY_OPTIONS.map((day) => (
                    <button
                      key={day.bit}
                      type="button"
                      className="saved-commute-day-button"
                      aria-pressed={(schedule.dayMask & day.bit) !== 0}
                      disabled={!controlsEnabled}
                      onClick={() => setDay(day.bit)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <div className="saved-commute-time-window">
                  <label>
                    <span>Start</span>
                    <input
                      type="time"
                      aria-label={`${label} start time`}
                      value={minuteToTimeValue(schedule.startMinute)}
                      disabled={!controlsEnabled}
                      onChange={(event) => updateSchedule(key, { startMinute: timeValueToMinute(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      type="time"
                      aria-label={`${label} end time`}
                      value={minuteToTimeValue(schedule.endMinute)}
                      disabled={!controlsEnabled}
                      onChange={(event) => updateSchedule(key, { endMinute: timeValueToMinute(event.target.value) })}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="saved-commute-notification-rule">
      <div className="saved-commute-schedule-list">
        {renderLegSchedule("outboundSchedule", "Outbound Route", rule.outboundEnabled, true)}
        {renderLegSchedule("returnSchedule", "Return Route", rule.returnEnabled, allowReturnLeg)}
      </div>

      <div className="saved-commute-notification-block saved-commute-event-types">
        <div className="station-arrival-line-divider saved-commute-notification-divider" aria-hidden="true" />
        <span className="saved-commute-notification-section-heading">
          <strong>Notify Me About</strong>
          <em>Select every event type you want to receive.</em>
        </span>
        <div className="saved-commute-notification-checks">
          {notificationEventOptionsForNetwork(networkId).map((eventType) => (
            <label key={eventType.key} data-event-type={eventType.key}>
              <span className="saved-commute-notification-event-label">
                <NotificationEventIcon eventType={eventType.key} />
                <span>{eventType.label}</span>
              </span>
              <input
                type="checkbox"
                checked={rule.eventTypes[eventType.key]}
                disabled={!rule.enabled}
                onChange={(event) =>
                  updateRule({
                    eventTypes: {
                      ...rule.eventTypes,
                      [eventType.key]: event.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="saved-commute-notification-master-row">
        <div className="saved-commute-notification-master-copy">
          <Bell size={16} aria-hidden="true" />
          <span>
            <strong>Route Notifications</strong>
            <em>Get alerts for impacts along this commute.</em>
          </span>
        </div>
        <div className="saved-commute-return-toggle saved-commute-notification-master">
          <SquishSwitch
            checked={rule.enabled}
            ariaLabel="Route notifications"
            trackOnColor="#10b981"
            onChange={(enabled) => updateRule({ enabled })}
          />
        </div>
      </div>

      <details className="saved-commute-notification-help">
        <summary>
          <Info size={13} aria-hidden="true" />
          <span>How Scheduling Works</span>
          <ChevronDown className="saved-commute-notification-help-chevron" size={14} aria-hidden="true" />
        </summary>
        <ul>
          <li>All times use Toronto time (ET).</li>
          <li>If a time window continues past midnight, it counts as part of the day it started.</li>
          <li>If a disruption starts outside your selected hours, you may be notified when your next notification window opens.</li>
          <li>Changing these settings will not send an immediate notification for disruptions that are already active.</li>
        </ul>
      </details>
    </div>
  );
}
