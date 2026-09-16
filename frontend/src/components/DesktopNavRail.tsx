"use client";

import { useRef, type RefObject } from "react";
import {
  AlertTriangle,
  History,
  MapPin,
  Menu,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { OverlappingCountBadge } from "./OverlappingCountBadge";
import { NetworkSelector } from "./NetworkSelector";
import type { NetworkId } from "../app/regional-data";

export type DesktopRailDestination = "status" | "search" | "stations" | "commutes" | "alert-history" | "more";

export type DesktopNavRailProps = {
  activeDestination: DesktopRailDestination;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectDestination: (destination: DesktopRailDestination) => void;
  statusAlertCount?: number;
  commuteAffectedCount?: number;
  savedStationsAffectedCount?: number;
  toggleButtonRef?: RefObject<HTMLButtonElement | null>;
  selectedNetwork?: NetworkId;
  onNetworkChange?: (network: NetworkId) => void;
};

type RailItemDef = {
  key: DesktopRailDestination;
  label: string;
  Icon: typeof AlertTriangle;
};

const RAIL_ITEMS: readonly RailItemDef[] = [
  { key: "status", label: "Status", Icon: AlertTriangle },
  { key: "search", label: "Search", Icon: Search },
  { key: "stations", label: "My Stations", Icon: MapPin },
  { key: "commutes", label: "My Commutes", Icon: Navigation },
  { key: "alert-history", label: "Alert History", Icon: History },
  { key: "more", label: "More", Icon: Menu },
];

export function DesktopNavRail({
  activeDestination,
  collapsed,
  onToggleCollapse,
  onSelectDestination,
  statusAlertCount = 0,
  commuteAffectedCount = 0,
  savedStationsAffectedCount = 0,
  toggleButtonRef,
  selectedNetwork,
  onNetworkChange,
}: DesktopNavRailProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleToggleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    }
  };

  const handleItemKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (index + 1) % RAIL_ITEMS.length;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        if (toggleButtonRef?.current) {
          toggleButtonRef.current.focus();
        } else {
          itemRefs.current[RAIL_ITEMS.length - 1]?.focus();
        }
      } else {
        itemRefs.current[index - 1]?.focus();
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[RAIL_ITEMS.length - 1]?.focus();
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
              onClick={() => onSelectDestination(key)}
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
      </nav>

      {selectedNetwork && onNetworkChange ? (
        <div className="desktop-rail-network-slot">
          <NetworkSelector
            network={selectedNetwork}
            onChange={onNetworkChange}
            compactVertical
          />
        </div>
      ) : null}
    </aside>
  );
}
