import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

export function FilterSearchRow({ children, active, onReset }: {
  children: ReactNode;
  active: boolean;
  onReset: () => void;
}) {
  return <div className="filter-search-row">
    {children}
    {active && <button type="button" className="filter-reset-button" aria-label="Reset filters" title="Reset filters" onClick={onReset}>
      <RotateCcw size={15} aria-hidden="true" />
    </button>}
  </div>;
}

export function FilterResultCount({ shown, total, noun }: { shown: number; total: number; noun: "incidents" | "notices" }) {
  const nounText = noun === "incidents"
    ? (total === 1 ? "incident" : "incidents")
    : (total === 1 ? "notice" : "notices");
  return <span className="filter-result-count" role="status">
    Showing <strong>{shown}</strong> of <strong>{total}</strong> matching {nounText}
  </span>;
}
