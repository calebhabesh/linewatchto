import { Navigation } from "lucide-react";
import { commutesByTripTimes, type ImpactCommute } from "../app/commute-data";
import { commuteTagLabel } from "../app/upcoming-advisory-preview";

/**
 * A quiet hint on a Current Service card whose impact lies on a saved commute:
 * My Commutes' green icon in a green-tinted circle with a small red "affected"
 * dot, in an incident card's top-right corner (an upcoming card's title row,
 * beside its countdown). Named "Affects Work" or "Affects 2 of My Commutes" for
 * screen readers and, with the commutes listed, on hover. Upcoming work that
 * meets its commutes only outside their trip times draws the icon and its dot grey
 * ("On Work Commute, Outside Trip Times"). Nothing when it touches none.
 */
export function CommuteImpactTag({ commutes }: { commutes: ImpactCommute[] | undefined }) {
  if (!commutes?.length) return null;
  const { during, outside } = commutesByTripTimes(commutes);
  const shown = during.length > 0 ? during : outside;
  const label = commuteTagLabel(commutes);
  return (
    <span
      className="commute-impact-hint"
      data-outside-trip-times={during.length === 0 ? "true" : undefined}
      role="img"
      aria-label={label}
      title={shown.length > 1 ? `${label}: ${shown.map((entry) => entry.label).join(", ")}` : label}
    >
      <Navigation size={12} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}
