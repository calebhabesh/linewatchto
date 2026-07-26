import { MapPinCheck } from "lucide-react";
import type { NetworkId } from "../app/regional-data";

type Props = {
  value: NetworkId;
  onChange: (network: NetworkId) => void;
  compact?: boolean;
};

export function DefaultMapModeControl({ value, onChange, compact = false }: Props) {
  return (
    <div className={`default-map-mode-control ${compact ? "is-compact" : ""}`}>
      <div className="default-map-mode-label">
        <MapPinCheck size={18} aria-hidden="true" className="default-map-mode-icon" />
        <div className="default-map-mode-text">
          <strong>Default Map</strong>
          <small>Loaded on launch</small>
        </div>
      </div>
      <div className="default-map-mode-options" role="group" aria-label="Default map" data-network={value}>
        <span className="default-map-mode-glider" aria-hidden="true" />
        <button
          type="button"
          className={`default-map-mode-btn default-map-mode-btn-ttc ${value === "ttc" ? "is-selected" : ""}`}
          aria-pressed={value === "ttc"}
          onClick={() => onChange("ttc")}
        >
          TTC
        </button>
        <button
          type="button"
          className={`default-map-mode-btn default-map-mode-btn-regional ${value === "regional" ? "is-selected" : ""}`}
          aria-pressed={value === "regional"}
          onClick={() => onChange("regional")}
        >
          GO &amp; UP
        </button>
      </div>
    </div>
  );
}
