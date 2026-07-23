function minutesFromSeconds(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

const RANGE_SEPARATOR = "\u00a0–\u00a0";

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

export function formatEstimateDuration(seconds: number | null | undefined) {
  const minutes = minutesFromSeconds(seconds);
  return minutes === 0 ? "Unavailable" : formatDurationMinutes(minutes);
}

export function formatEstimateRange(
  lowSeconds: number | null | undefined,
  highSeconds: number | null | undefined,
) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "Unavailable";
  if (low === 0) return formatDurationMinutes(high);
  if (low === high || high === 0) return formatDurationMinutes(low);
  return `${formatDurationMinutes(low)}${RANGE_SEPARATOR}${formatDurationMinutes(high)}`;
}

export function formatExtraTimeRange(
  lowSeconds: number | null | undefined,
  highSeconds: number | null | undefined,
) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "+0 min";
  if (low === high || high === 0) return `+${formatDurationMinutes(low)}`;
  if (low < 60 && high < 60) return `+${low}${RANGE_SEPARATOR}${high} min`;
  return `+${formatDurationMinutes(low)}${RANGE_SEPARATOR}${formatDurationMinutes(high)}`;
}

type TravelTimeHeadlineEstimate = {
  status: "standard" | "estimated" | "unreliable" | "unavailable";
  baselineSeconds: number;
  estimatedLowSeconds: number | null;
  estimatedHighSeconds: number | null;
  confidence: string;
};

export function formatConfidenceLabel(confidence: string | null | undefined) {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
    default: {
      const normalized = confidence?.trim();
      return normalized
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
        : "Unknown";
    }
  }
}

export function formatTravelTimeHeadline(estimate: TravelTimeHeadlineEstimate) {
  switch (estimate.status) {
    case "estimated":
      return {
        value: formatEstimateRange(estimate.estimatedLowSeconds, estimate.estimatedHighSeconds),
        context: `Estimated Now · ${formatConfidenceLabel(estimate.confidence)} Confidence`,
      };
    case "standard":
      return {
        value: `About ${formatEstimateDuration(estimate.baselineSeconds)}`,
        context: "Typical Scheduled Time",
      };
    case "unreliable":
      return {
        value: "Travel Time Unreliable",
        context: "Major Disruption on Route",
      };
    case "unavailable":
      return {
        value: "Estimate unavailable",
        context: "No route time available",
      };
  }
}
