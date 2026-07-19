"use client";

import { AlertTriangle, Map as MapIcon, MoreHorizontal, Navigation, Search } from "lucide-react";

export type MobileNavKey = "map" | "status" | "search" | "commutes" | "more";

type MobileBottomNavProps = {
  activeKey: MobileNavKey;
  alertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
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
  { key: "search", label: "Search", Icon: Search },
  { key: "commutes", label: "Commutes", Icon: Navigation },
  { key: "more", label: "More", Icon: MoreHorizontal },
];

export function MobileBottomNav({
  activeKey,
  alertCount,
  delayCount,
  reducedSpeedZoneCount,
  commuteAffectedCount,
  onSelect,
}: MobileBottomNavProps) {
  const statusCount = alertCount + delayCount + reducedSpeedZoneCount;

  function badgeFor(key: MobileNavKey) {
    if (key === "status" && statusCount > 0) return statusCount;
    if (key === "commutes" && commuteAffectedCount > 0) return commuteAffectedCount;
    return null;
  }

  return (
    <nav
      className="mobile-bottom-nav"
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
              {badge ? <span className="mobile-bottom-nav-badge" aria-hidden="true">{badge}</span> : null}
            </span>
            <span className="mobile-bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
