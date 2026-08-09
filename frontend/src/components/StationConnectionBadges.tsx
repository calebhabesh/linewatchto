import Image from "next/image";

import type { StationConnection } from "../app/station-connections";

const CONNECTION_ICON: Record<StationConnection["kind"], string> = {
  go: "/assets/linewatch/connections/go-logo.svg",
  via: "/assets/linewatch/connections/via-rail-logo.svg",
  up: "/assets/linewatch/connections/up-express-logo.svg",
  airport: "/assets/linewatch/connections/airport.svg",
};

export function StationConnectionBadges({ connections }: { connections: readonly StationConnection[] }) {
  if (connections.length === 0) return null;

  return (
    <section className="station-connections-card" aria-labelledby="station-connections-title">
      <h3 id="station-connections-title" className="station-connections-title">Connected Networks</h3>
      <div className="station-connection-list">
        {connections.map((connection) => (
          <div
            key={`${connection.kind}:${connection.label}`}
            className={`station-connection-row station-connection-row--${connection.kind}`}
          >
            <span className="station-connection-logo-frame" aria-hidden="true">
              <Image
                src={CONNECTION_ICON[connection.kind]}
                alt=""
                width={connection.kind === "airport" ? 24 : 44}
                height={24}
                className="station-connection-icon"
              />
            </span>
            <span className="station-connection-copy">
              <strong>{connection.label}</strong>
              <small>{connection.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
