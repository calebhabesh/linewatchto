import { ArrowRight } from "lucide-react";
import type { AccountCommutePathPreview } from "../app/commute-data";

export function CommuteRouteLabel({ label }: { label: string }) {
  const stations = label.split(/\s*(?:→|-\s*>)\s*/);
  if (stations.length !== 2) return label;
  return (
    <>
      {stations[0]}{" "}
      <ArrowRight className="commute-route-direction-arrow" size={16} strokeWidth={3} aria-hidden="true" />
      <span className="sr-only"> → </span>{" "}{stations[1]}
    </>
  );
}

/**
 * The "Viewing" chip's text: its caption with, beside it, the saved commute's
 * name when it is one (an Alert History preview names itself in the caption instead), and the
 * route. A name that only repeats the route is left out.
 */
export function CommutePreviewChipText({
  preview,
  arrow = true,
}: {
  preview: AccountCommutePathPreview;
  /** Draw the route's arrow as an icon; the embedded card banner keeps the text arrow. */
  arrow?: boolean;
}) {
  const name = preview.chipLabel ? null : preview.label.trim();
  const showName = Boolean(name) && name !== preview.routeLabel;
  return (
    <>
      <span className="commute-path-preview-chip__heading">
        <span className="commute-path-preview-chip__caption">
          Viewing{preview.chipLabel ? ` ${preview.chipLabel}` : null}
          <span className="commute-path-preview-chip__colon">{preview.chipLabel || showName ? ":" : null}</span>
        </span>
        {showName ? <>{" "}<span className="commute-path-preview-chip__name">{name}</span></> : null}
      </span>{" "}
      <strong>{arrow ? <CommuteRouteLabel label={preview.routeLabel} /> : preview.routeLabel}</strong>
    </>
  );
}
