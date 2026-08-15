import Image from "next/image";
import { OverlappingCountBadge } from "./OverlappingCountBadge";

const OUTAGE_ICON_SRC = {
  elevator: "/assets/linewatch/outages/elevator.svg",
  escalator: "/assets/linewatch/outages/escalator.svg",
} as const;

export function StationOutageBadge({
  assetType,
  count,
}: {
  assetType: "elevator" | "escalator";
  count: number;
}) {
  const assetLabel = assetType === "elevator" ? "Elevator" : "Escalator";
  const label = `${count} ${assetLabel} ${count === 1 ? "Outage" : "Outages"}`;

  return (
    <span className="station-search-outage-badge" aria-label={label} title={label}>
      <Image
        src={OUTAGE_ICON_SRC[assetType]}
        alt=""
        width={22}
        height={22}
        aria-hidden="true"
      />
      <OverlappingCountBadge className="station-search-outage-count" count={count} />
    </span>
  );
}
