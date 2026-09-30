import { Plus } from "lucide-react";
import { lineAdvisoryCountLabel, type LineStatusPresentation } from "../app/current-service";

export function LineAdvisoryCount({ count }: { count: number }) {
  return (
    <span className="line-service-advisory-count current-service-notice-service">
      <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
      {lineAdvisoryCountLabel(count)}
    </span>
  );
}

export function LineAdvisorySummary({ count }: { count: number }) {
  return (
    <div className="line-service-advisory-summary">
      <span>Other advisories</span>
      <LineAdvisoryCount count={count} />
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
      {presentation.advisoryCount ? (
        <LineAdvisoryCount count={presentation.advisoryCount} />
      ) : null}
    </span>
  );
}
