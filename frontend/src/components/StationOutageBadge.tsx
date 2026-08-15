import Image from "next/image";

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
      <span className="station-search-outage-count overlapping-count-badge">{count}</span>
    </span>
  );
}
