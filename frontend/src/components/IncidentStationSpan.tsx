import { MoveHorizontal } from "lucide-react";

/** Align corridor arrows with the station text independently of font glyph metrics. */
export function IncidentStationSpan({ location }: { location: string }) {
  const stations = location.split("↔");
  return <>{stations.map((station, index) => <span key={index}>
    {index > 0 && <>
      <MoveHorizontal size={14} strokeWidth={2} aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-2px", marginInline: "3px" }} />
      <span className="sr-only">↔</span>
    </>}
    {station}
  </span>)}</>;
}
