import type { NetworkId } from "../app/regional-data";

export function NetworkSelector({ network, onChange }: { network: NetworkId; onChange: (network: NetworkId) => void }) {
  return (
    <div
      className="network-selector panel"
      role="group"
      aria-label="Select transit network"
      data-network={network}
    >
      <button
        type="button"
        aria-pressed={network === "ttc"}
        onClick={() => onChange("ttc")}
        className="network-selector-btn network-btn-ttc"
      >
        <span className="network-indicator-dot network-dot-ttc" aria-hidden="true" />
        <span className="network-btn-text">TTC</span>
      </button>
      <button
        type="button"
        aria-pressed={network === "regional"}
        onClick={() => onChange("regional")}
        className="network-selector-btn network-btn-regional"
      >
        <span className="network-indicator-dot network-dot-regional" aria-hidden="true" />
        <span className="network-btn-text">GO/UP</span>
      </button>
    </div>
  );
}
