"use client";

import { AlertTriangle, Map as MapIcon, MoreHorizontal, Bookmark } from "lucide-react";
import { OverlappingCountBadge } from "./OverlappingCountBadge";

export type MobileNavKey = "map" | "status" | "saved" | "more";

type MobileBottomNavProps = {
  activeKey: MobileNavKey;
  alertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
  plannedClosureCount: number;
  tripChangeCount?: number;
  commuteAffectedCount: number;
  onSelect: (key: MobileNavKey) => void;
};

const ITEMS: Array<{
  key: MobileNavKey;
  label: string;
  Icon: typeof MapIcon;
}> = [
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "status", label: "Status", Icon: AlertTriangle },
  { key: "saved", label: "Saved", Icon: Bookmark },
  { key: "more", label: "More", Icon: MoreHorizontal },
];

export function MobileBottomNav({
  activeKey,
  alertCount,
  delayCount,
  reducedSpeedZoneCount,
  plannedClosureCount,
  tripChangeCount = 0,
  commuteAffectedCount,
  onSelect,
}: MobileBottomNavProps) {
  const statusCount = alertCount + delayCount + reducedSpeedZoneCount + plannedClosureCount + tripChangeCount;

  function badgeFor(key: MobileNavKey) {
    if (key === "status" && statusCount > 0) return statusCount;
    if (key === "saved" && commuteAffectedCount > 0) return commuteAffectedCount;
    return null;
  }

  return (
    <nav
      className="mobile-bottom-nav"
      data-map-chooser-keepout
      role="navigation"
      aria-label="Primary mobile navigation"
      data-active-key={activeKey}
    >
      {ITEMS.map(({ key, label, Icon }) => {
        const selected = activeKey === key;
        const badge = badgeFor(key);
        return (
          <button
            key={key}
            type="button"
            className="mobile-bottom-nav-item"
            aria-current={selected ? "page" : undefined}
            aria-label={label}
            data-active={selected ? "true" : "false"}
            data-nav-key={key}
            onClick={() => onSelect(key)}
          >
            <span className="mobile-bottom-nav-icon">
              <Icon size={21} aria-hidden="true" />
              {badge ? <OverlappingCountBadge className="mobile-bottom-nav-badge" count={badge} /> : null}
            </span>
            <span className="mobile-bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
