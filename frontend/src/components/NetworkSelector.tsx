import type { NetworkId } from "../app/regional-data";

export function NetworkSelector({ network, onChange }: { network: NetworkId; onChange: (network: NetworkId) => void }) {
  return (
    <div className="network-selector panel" role="group" aria-label="Select transit network">
      <button type="button" aria-pressed={network === "ttc"} onClick={() => onChange("ttc")}>TTC</button>
      <button type="button" aria-pressed={network === "regional"} onClick={() => onChange("regional")}>GO &amp; UP</button>
    </div>
  );
}
