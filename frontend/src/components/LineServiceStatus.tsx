import type { CSSProperties } from "react";
import { Plus } from "lucide-react";
import { SPINE_ATTRIBUTE } from "../hooks/useAdvisoryTrunkEnds";
import { lineAdvisoryCountLabel, type LineStatusPresentation } from "../app/current-service";
import { transitLineBadgeColors } from "./TransitLineBadge";

function LineAdvisoryCount({ count }: { count: number }) {
  return (
    <span className="line-service-advisory-count current-service-notice-service">
      <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
      {lineAdvisoryCountLabel(count)}
    </span>
  );
}

/** Lines whose badge colour is under 3:1 on the dark panel; their dark-mode spine is lightened. */
const DARK_LINE_IDS = new Set(["line-4", "regional-br", "regional-lw", "regional-st"]);

/** A line's spine to its advisory headings, in its badge colour; useAdvisoryTrunkEnds draws the path. */
export function AdvisorySpine({ lineId }: { lineId: string }) {
  return (
    <svg
      className="advisory-spine"
      aria-hidden="true"
      data-dark-line={DARK_LINE_IDS.has(lineId) ? "true" : undefined}
      style={{ "--advisory-spine-color": transitLineBadgeColors(lineId).backgroundColor } as CSSProperties}
      {...{ [SPINE_ATTRIBUTE]: "" }}
    >
      <path />
    </svg>
  );
}

/** Heads a line's Reduced Speed Zone pills, with the line's advisory count at the right. */
export function LineAdvisorySummary({ count }: { count: number }) {
  return (
    <div className="line-service-advisory-summary">
      <span data-trunk-end="">Other Advisories</span>
      {count > 0 && <LineAdvisoryCount count={count} />}
    </div>
  );
}

export function LineServiceStatus({ presentation }: { presentation: LineStatusPresentation }) {
  return (
    <span className="line-service-conditional">
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" fill="#b58900" />
        <path d="M4.75 8.25L6.75 10.25L11.25 5.75" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <strong>{presentation.label}</strong>
    </span>
  );
}
