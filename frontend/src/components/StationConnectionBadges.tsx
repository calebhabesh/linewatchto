import Image from "next/image";
import { GitMerge } from "lucide-react";

import type { StationConnection } from "../app/station-connections";

const CONNECTION_ICON: Record<StationConnection["kind"], string> = {
  go: "/assets/linewatch/connections/go-logo.svg",
  via: "/assets/linewatch/connections/via-rail-logo.svg",
  up: "/assets/linewatch/connections/up-express-logo.svg",
  airport: "/assets/linewatch/connections/airport.svg",
  ttc: "/assets/linewatch/line-1-legend.svg",
};

function renderConnectionLabel(label: string) {
  if (!label.includes(" · ")) {
    return label;
  }
  const parts = label.split(" · ");
  return parts.map((part, index) => (
    <span key={index}>
      {index > 0 && (
        <span className="station-connection-dot-sep" aria-hidden="true">
          ·
        </span>
      )}
      {part}
    </span>
  ));
}

export function StationConnectionBadges({ connections }: { connections: readonly StationConnection[] }) {
  if (connections.length === 0) return null;

  const heading = connections.length === 1 ? "Connected Network" : "Connected Networks";

  return (
    <section
      className="station-connections-card flex w-full flex-col gap-3 rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
      aria-labelledby="station-connections-title"
    >
      <h3 id="station-connections-title" className="station-connections-title flex items-center gap-2.5">
        <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
        <GitMerge size={14} className="shrink-0 text-slate-700 dark:text-white" aria-hidden="true" />
        <span>{heading}</span>
      </h3>
      <div className="station-connection-list">
        {connections.map((connection) => (
          <div
            key={`${connection.kind}:${connection.label}`}
            className={`station-connection-row station-connection-row--${connection.kind}`}
          >
            <span className="station-connection-logo-frame" aria-hidden="true">
              <Image
                src={connection.icon ?? CONNECTION_ICON[connection.kind]}
                alt=""
                width={connection.kind === "airport" ? 30 : connection.kind === "ttc" ? 32 : 44}
                height={connection.kind === "airport" ? 30 : connection.kind === "ttc" ? 32 : 24}
                className="station-connection-icon"
              />
            </span>
            <span className="station-connection-copy">
              <strong>{renderConnectionLabel(connection.label)}</strong>
              <small>{connection.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
