/** Keep useful alternatives, the unfiltered option, and an active empty selection.
 * Undefined counts mean the result set is still loading or the control is a sort.
 */
export function availableFilterOptions<T extends { value: string; count?: number }>(
  options: T[], selectedValue: string, allValue = "all",
): T[] {
  return options.filter(option => option.count === undefined || option.count > 0
    || option.value === selectedValue || option.value === allValue);
}
