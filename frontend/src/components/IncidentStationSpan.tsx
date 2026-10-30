import { ArrowRight, ArrowRightLeft, Minus } from "lucide-react";
import { formatImpactLocation } from "../app/impact-location";
import { parseStationSections, type StationSpanTravel } from "../app/station-span";

const ICON_STYLE = { display: "inline-block", verticalAlign: "-3px", marginInline: "5px", flexShrink: 0 } as const;

/**
 * Station span whose connector states the affected travel directions:
 * → one way (stations in travel order), ⇄ both ways, a neutral dash when unspecified.
 */
export function IncidentStationSpan({ location, direction }: { location: string; direction?: string | null }) {
  const sections = parseStationSections(location, direction);
  if (!sections) return <>{formatImpactLocation(location)}</>;
  return <>
    {sections.map((span, index) => (
      <span key={index}>
        {index > 0 ? <StationSectionJoiner last={index === sections.length - 1} /> : null}
        <span>{span.from}</span>
        <StationSpanConnector travel={span.travel} size={16} />
        <span>{span.to}</span>
        {span.travel === "both-ways" && <span className="sr-only">, both directions</span>}
      </span>
    ))}
  </>;
}

/** The lighter "and" (or comma) between separately closed sections, so each section reads as a unit. */
export function StationSectionJoiner({ last, className = "station-section-joiner" }: { last: boolean; className?: string }) {
  return last ? <span className={className}> and </span> : <span className={className}>, </span>;
}

/** Shared connector glyph; the visible arrows are decorative and read as "to". */
export function StationSpanConnector({
  travel,
  size,
  className,
}: {
  travel: StationSpanTravel;
  size: number;
  className?: string;
}) {
  // The dash claims no direction; it matches the arrows' size and weight.
  const Icon = travel === "one-way" ? ArrowRight : travel === "both-ways" ? ArrowRightLeft : Minus;
  return <>
    <Icon size={size} strokeWidth={2.25} aria-hidden="true" focusable="false" className={className} style={className ? undefined : ICON_STYLE} />
    <span className="sr-only"> to </span>
  </>;
}
