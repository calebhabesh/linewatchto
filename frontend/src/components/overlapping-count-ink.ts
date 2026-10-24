/* Ink metrics for Switzer's bold tabular digits, in thousandths of an em:
   [left gap, right gap, top above baseline, bottom below baseline].
   Tabular digits share one advance width, but their ink is not centered in it
   ("1" has a wide left gap), so centering the advance box leaves counts like
   "18" visibly off-center. Count badges center the ink instead. */
const DIGIT_INK: Record<string, readonly [number, number, number, number]> = {
  "0": [15, 13, 672, 32],
  "1": [93, 60, 657, 16],
  "2": [31, 44, 672, 16],
  "3": [15, 13, 672, 32],
  "4": [31, 13, 657, 0],
  "5": [31, 13, 657, 32],
  "6": [15, 13, 672, 32],
  "7": [46, 44, 657, 0],
  "8": [31, 13, 672, 32],
  "9": [15, 13, 672, 32],
};
const FALLBACK_INK = [24, 24, 665, 16] as const;

/**
 * Em offsets that move a label's visible ink center onto the text anchor:
 * dx corrects uneven side gaps, dy drops an alphabetic baseline by half the ink height.
 */
export function countBadgeInkOffset(label: string) {
  if (!label) return { dx: 0, dy: 0 };
  const first = DIGIT_INK[label[0]] ?? FALLBACK_INK;
  const last = DIGIT_INK[label[label.length - 1]] ?? FALLBACK_INK;
  let top = 0;
  let bottom = 0;
  for (const char of label) {
    const ink = DIGIT_INK[char] ?? FALLBACK_INK;
    top = Math.max(top, ink[2]);
    bottom = Math.max(bottom, ink[3]);
  }
  return {
    dx: (last[1] - first[0]) / 2000,
    dy: (top - bottom) / 2000,
  };
}
