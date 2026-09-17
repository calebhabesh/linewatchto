"use client";

import { useRef, type RefObject } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Construction,
  History,
  MapPin,
  Menu,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  TrainFront,
  UserRound,
} from "lucide-react";
import { OverlappingCountBadge } from "./OverlappingCountBadge";
import { NetworkSelector } from "./NetworkSelector";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import type { NetworkId } from "../app/regional-data";
import type { DesktopRailDestination } from "../app/desktop-sidebar-state";

export type { DesktopRailDestination };

export type DesktopNavRailProps = {
  activeDestination: DesktopRailDestination;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectDestination: (destination: DesktopRailDestination) => void;
  statusAlertCount?: number;
  activeAlertCount?: number;
  delayCount?: number;
  reducedSpeedZoneCount?: number;
  plannedClosureCount?: number;
  tripChangeCount?: number;
  commuteAffectedCount?: number;
  savedStationsAffectedCount?: number;
  toggleButtonRef?: RefObject<HTMLButtonElement | null>;
  selectedNetwork?: NetworkId;
  onNetworkChange?: (network: NetworkId) => void;
  authenticated?: boolean;
  onRequestSignIn?: () => void;
};

type RailItemDef = {
  key: DesktopRailDestination | "sign-in";
  label: string;
  Icon: typeof AlertTriangle;
};

const RAIL_ITEMS: readonly RailItemDef[] = [
  { key: "status", label: "Status", Icon: AlertTriangle },
  { key: "sign-in", label: "Sign In", Icon: UserRound },
  { key: "stations", label: "My Stations", Icon: MapPin },
  { key: "commutes", label: "My Commutes", Icon: Navigation },
  { key: "alert-history", label: "Alert History", Icon: History },
  { key: "more", label: "More", Icon: Menu },
];

const ALERT_SHORTCUT_COUNT = 4;
const ANALYTICS_INDEX = RAIL_ITEMS.length + ALERT_SHORTCUT_COUNT;
const SOURCE_STATUS_INDEX = ANALYTICS_INDEX + 1;
const TOTAL_RAIL_SLOTS = RAIL_ITEMS.length + ALERT_SHORTCUT_COUNT + 2;

export function DesktopNavRail({
  activeDestination,
  collapsed,
  onToggleCollapse,
  onSelectDestination,
  statusAlertCount = 0,
  activeAlertCount = 0,
  delayCount = 0,
  reducedSpeedZoneCount = 0,
  plannedClosureCount = 0,
  tripChangeCount = 0,
  commuteAffectedCount = 0,
  savedStationsAffectedCount = 0,
  toggleButtonRef,
  selectedNetwork = "ttc",
  onNetworkChange,
  authenticated = false,
  onRequestSignIn,
}: DesktopNavRailProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sourceStatusLabel =
    selectedNetwork === "regional" ? "GO / UP Source Status" : "TTC Source Status";
  const alertShortcuts = selectedNetwork === "regional"
    ? [
        { key: "alerts", label: "Active Alerts", lines: ["Active", "Alerts"], count: activeAlertCount, countLabel: activeAlertCount === 1 ? "active alert" : "active alerts", icon: <AlertTriangle size={21} aria-hidden="true" /> },
        { key: "delays", label: "Delays", lines: ["Delays"], count: delayCount, countLabel: delayCount === 1 ? "delay" : "delays", icon: <DelayIcon size={21} /> },
        { key: "trip-changes", label: "Trip Changes", lines: ["Trip", "Changes"], count: tripChangeCount, countLabel: tripChangeCount === 1 ? "trip change" : "trip changes", icon: <TrainFront size={21} aria-hidden="true" /> },
        { key: "closures", label: "Planned Closures", lines: ["Planned", "Closures"], count: plannedClosureCount, countLabel: plannedClosureCount === 1 ? "planned closure" : "planned closures", icon: <PlannedClosureIcon size={21} /> },
      ] as const
    : [
        { key: "alerts", label: "Active Alerts", lines: ["Active", "Alerts"], count: activeAlertCount, countLabel: activeAlertCount === 1 ? "active alert" : "active alerts", icon: <AlertTriangle size={21} aria-hidden="true" /> },
        { key: "delays", label: "Delays", lines: ["Delays"], count: delayCount, countLabel: delayCount === 1 ? "delay" : "delays", icon: <DelayIcon size={21} /> },
        { key: "reduced-speed-zones", label: "Reduced Speed Zones", lines: ["Reduced", "Speed", "Zones"], count: reducedSpeedZoneCount, countLabel: reducedSpeedZoneCount === 1 ? "reduced speed zone" : "reduced speed zones", icon: <Construction size={21} aria-hidden="true" /> },
        { key: "closures", label: "Planned Closures", lines: ["Planned", "Closures"], count: plannedClosureCount, countLabel: plannedClosureCount === 1 ? "planned closure" : "planned closures", icon: <PlannedClosureIcon size={21} /> },
      ] as const;

  const handleToggleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    }
  };

  const handleItemKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (index + 1) % TOTAL_RAIL_SLOTS;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        if (toggleButtonRef?.current) {
          toggleButtonRef.current.focus();
        } else {
          itemRefs.current[TOTAL_RAIL_SLOTS - 1]?.focus();
        }
      } else {
        itemRefs.current[index - 1]?.focus();
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[TOTAL_RAIL_SLOTS - 1]?.focus();
    }
  };

  return (
    <aside
      className="desktop-nav-rail"
      role="navigation"
      aria-label="Desktop primary navigation"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="desktop-rail-header">
        <button
          ref={toggleButtonRef}
          type="button"
          onClick={onToggleCollapse}
          onKeyDown={handleToggleKeyDown}
          className="desktop-rail-toggle"
          aria-expanded={!collapsed}
          aria-controls="desktop-sidebar-container"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={22} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={22} aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="desktop-rail-items" aria-label="Navigation destinations">
        {RAIL_ITEMS.map(({ key, label, Icon }, index) => {
          if (key === "sign-in") {
            const isAccountActive = false;
            return (
              <button
                key="sign-in"
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                className="desktop-rail-item desktop-rail-account-item"
                data-active={isAccountActive ? "true" : "false"}
                data-authenticated={authenticated ? "true" : "false"}
                data-dest="sign-in"
                aria-current={isAccountActive ? "page" : undefined}
                aria-label={authenticated ? "Account, Signed in" : "Sign In"}
                title={authenticated ? "Account (Signed In)" : "Sign In"}
                onClick={onRequestSignIn ? onRequestSignIn : () => onSelectDestination("more")}
                onKeyDown={(e) => handleItemKeyDown(index, e)}
              >
                <span className="desktop-rail-icon-slot">
                  <UserRound size={21} aria-hidden="true" />
                </span>
                <span className="desktop-rail-label">{authenticated ? "Account" : label}</span>
              </button>
            );
          }

          const isSelected = activeDestination === key;
          let badge: number | null = null;
          let badgeLabel = "";
          if (key === "status" && statusAlertCount > 0) {
            badge = statusAlertCount;
            badgeLabel = `${badge} active alerts`;
          } else if (key === "stations" && savedStationsAffectedCount > 0) {
            badge = savedStationsAffectedCount;
            badgeLabel = `${badge} affected stations`;
          } else if (key === "commutes" && commuteAffectedCount > 0) {
            badge = commuteAffectedCount;
            badgeLabel = `${badge} affected commutes`;
          }

          return (
            <button
              key={key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              className="desktop-rail-item"
              data-active={isSelected ? "true" : "false"}
              data-dest={key}
              aria-current={isSelected ? "page" : undefined}
              aria-label={badge ? `${label}, ${badgeLabel}` : label}
              title={label}
              onClick={() => onSelectDestination(key as DesktopRailDestination)}
              onKeyDown={(e) => handleItemKeyDown(index, e)}
            >
              <span className="desktop-rail-icon-slot">
                <Icon size={21} aria-hidden="true" />
                {badge ? (
                  <OverlappingCountBadge
                    className="desktop-rail-badge"
                    count={badge}
                  />
                ) : null}
              </span>
              <span className="desktop-rail-label">{label}</span>
            </button>
          );
        })}
        {selectedNetwork && onNetworkChange ? (
          <div className="desktop-rail-network-slot">
            <NetworkSelector
              network={selectedNetwork}
              onChange={onNetworkChange}
              compactVertical
            />
          </div>
        ) : null}

        <div className="desktop-rail-bottom-group">
          <div className="desktop-rail-alert-shortcuts" role="group" aria-label="Service impact categories">
            {alertShortcuts.map((shortcut, shortcutIndex) => {
              const itemIndex = RAIL_ITEMS.length + shortcutIndex;
              const isSelected = activeDestination === shortcut.key;
              return (
                <button
                  key={shortcut.key}
                  ref={(element) => {
                    itemRefs.current[itemIndex] = element;
                  }}
                  type="button"
                  className="desktop-rail-item desktop-rail-alert-shortcut"
                  data-active={isSelected ? "true" : "false"}
                  data-alert-kind={shortcut.key}
                  data-dest={shortcut.key}
                  aria-current={isSelected ? "page" : undefined}
                  aria-label={shortcut.count > 0 ? `${shortcut.label}, ${shortcut.count} ${shortcut.countLabel}` : shortcut.label}
                  title={shortcut.label}
                  onClick={() => onSelectDestination(shortcut.key)}
                  onKeyDown={(event) => handleItemKeyDown(itemIndex, event)}
                >
                  <span className="desktop-rail-icon-slot">
                    {shortcut.icon}
                    {shortcut.count > 0 ? (
                      <OverlappingCountBadge
                        className="desktop-rail-badge desktop-rail-alert-badge"
                        count={shortcut.count}
                      />
                    ) : null}
                  </span>
                  <span className="desktop-rail-label desktop-rail-label--multiline">
                    {shortcut.lines.map((line) => <span key={line}>{line}</span>)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="desktop-rail-divider" role="separator" aria-orientation="horizontal" />

          <button
            ref={(element) => {
              itemRefs.current[ANALYTICS_INDEX] = element;
            }}
            type="button"
            className="desktop-rail-item desktop-rail-analytics-item"
            data-active={activeDestination === "analytics" ? "true" : "false"}
            data-dest="analytics"
            aria-current={activeDestination === "analytics" ? "page" : undefined}
            aria-label="Reliability Analytics"
            title="Reliability Analytics"
            onClick={() => onSelectDestination("analytics")}
            onKeyDown={(e) => handleItemKeyDown(ANALYTICS_INDEX, e)}
          >
            <span className="desktop-rail-icon-slot">
              <BarChart3 size={21} aria-hidden="true" />
            </span>
            <span className="desktop-rail-label">Data</span>
          </button>

          <button
            ref={(element) => {
              itemRefs.current[SOURCE_STATUS_INDEX] = element;
            }}
            type="button"
            className="desktop-rail-item desktop-rail-source-item"
            data-active={activeDestination === "source-status" ? "true" : "false"}
            data-dest="source-status"
            aria-current={activeDestination === "source-status" ? "page" : undefined}
            aria-label={sourceStatusLabel}
            title={sourceStatusLabel}
            onClick={() => onSelectDestination("source-status")}
            onKeyDown={(e) => handleItemKeyDown(SOURCE_STATUS_INDEX, e)}
          >
            <span className="desktop-rail-icon-slot">
              <Activity size={21} aria-hidden="true" />
            </span>
            <span className="desktop-rail-label desktop-rail-label--multiline">
              <span>Source</span>
              <span>Status</span>
            </span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
