/** Shared result count for filter options and their selected value. */
export function FilterOptionCount({ count }: { count?: number }) {
  return count === undefined ? null : (
    <span className="filter-option-count">{count}</span>
  );
}
