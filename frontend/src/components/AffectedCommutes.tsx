"use client";

import { createContext, useContext } from "react";
import { ArrowRight, Navigation } from "lucide-react";
import { commutesByTripTimes, type ImpactCommute } from "../app/commute-data";
import { commuteDisplayName } from "../app/upcoming-advisory-preview";

/**
 * The saved commutes each impact lies on (impactCommutes) and how to open one
 * in My Commutes. Provided by the shell; absent (signed out, no commutes) means
 * no links.
 */
export type AffectedCommutesValue = {
  commutesFor: (impactId: string) => ImpactCommute[];
  openCommute: (commuteId: string) => void;
};

export const AffectedCommutesContext = createContext<AffectedCommutesValue | null>(null);

/**
 * An alert card's link to each saved commute its impact lies on: a muted amber
 * fill (apart from the cards' red "in effect" and blue planned colours), My
 * Commutes' green icon, the commute's name in white, and an arrow. Pressing it opens that
 * commute in My Commutes. Upcoming work that meets a commute only outside its
 * trip times follows, in neutral grey: "Work Commute · Outside Trip Times".
 */
export function AffectedCommuteLinks({ impactId }: { impactId: string }) {
  const context = useContext(AffectedCommutesContext);
  const commutes = context?.commutesFor(impactId) ?? [];
  if (!context || commutes.length === 0) return null;
  const { during, outside } = commutesByTripTimes(commutes);
  return (
    <>
      {[...during, ...outside].map((commute) => (
        <button
          key={commute.id}
          type="button"
          className={`affected-commute-link${commute.outsideTripTimes ? " affected-commute-link--outside" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            context.openCommute(commute.id);
          }}
          aria-label={commute.outsideTripTimes
            ? `On ${commuteDisplayName(commute.label)}, outside its trip times: open it in My Commutes`
            : `Affects ${commuteDisplayName(commute.label)}: open it in My Commutes`}
        >
          <span className="affected-commute-link__icon" aria-hidden="true">
            <Navigation size={11} strokeWidth={2.5} />
          </span>
          <span className="affected-commute-link__label">
            {commute.outsideTripTimes
              ? `${commuteDisplayName(commute.label)} · Outside Trip Times`
              : `Affects ${commuteDisplayName(commute.label)}`}
          </span>
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      ))}
    </>
  );
}
