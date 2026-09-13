// Only enabled by playwright.onboarding.config.ts. Preserve IDs/contracts while
// giving the smoke examples readable, explicitly synthetic presentation text.
export function onboardingPresentation(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => onboardingPresentation(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, onboardingPresentation(item, name)]));
  }
  if (key === "live") return false;
  if (key === "lastPoll") return "Demo data";
  if (typeof value !== "string") return value;
  if (/source$/i.test(key) || key === "arrivalsSource") return "Demo data";
  return value
    .replaceAll("Morning commute", "Morning Commute")
    .replaceAll("Stub Station", "Eglinton")
    .replaceAll("Stub Terminal", "Sheppard-Yonge")
    .replaceAll("Stub API ", "")
    .replaceAll("Playwright API stub", "Demo data")
    .replaceAll("Smoke fixture", "Example service impacts")
    .replaceAll("Seeded demo", "Demo data")
    .replaceAll("Seeded smoke alert for browser verification.", "Example signal issue. Shuttle buses are running.")
    .replaceAll("Seeded active planned closure for browser verification.", "Example track work during a planned closure.")
    .replaceAll("for browser verification.", "in this demonstration.");
}

export function onboardingResponse(body) {
  const result = onboardingPresentation(body);
  // The old smoke-only Line 4 path deliberately used arbitrary test geometry.
  // Captures use the actual authored Sheppard-Yonge–Don Mills coordinates.
  for (const segment of result?.map?.segments ?? result?.segments ?? []) {
    if (segment.id === "line-4-sheppard-yonge-don-mills") {
      segment.pathD = "M 4552.0532 1086.3409 L 6010.9614 1086";
    }
  }
  if (result?.commutes) {
    for (const commute of result.commutes) {
      const path = {
        status: "available", stationIds: ["stub-eglinton", "stub-davisville"],
        segmentIds: ["stub-line-1-eglinton-davisville"], lineIds: ["line-1"], transferStationIds: [],
        segmentHops: [{ segmentId: "stub-line-1-eglinton-davisville", lineId: "line-1",
          fromStationId: "stub-eglinton", toStationId: "stub-davisville", travelDirection: "forward" }],
        estimatedTravelSeconds: 120, weightSource: "seeded-fallback",
        summary: "Default route: 2 stations on Line 1, about 2 min",
      };
      const impact = {
        status: "affected", severity: "minor", statusLabel: "Affected now",
        detail: "1 current impact matches this route.",
        matchedImpacts: [{ id: "reduced-speed-zone-stub-zone-south-source", kind: "reduced-speed-zone",
          status: "current", severity: "minor", title: "Reduced Speed Zone", lineId: "line-1", lineNumber: "1",
          location: "Eglinton to Davisville", displayDirection: "Southbound", source: "Demo data",
          matchedSegmentIds: path.segmentIds, matchedStationIds: [], timingStatus: "active-now" }],
        travelTimeEstimate: { status: "estimated", baselineSeconds: 120, estimatedLowSeconds: 180,
          estimatedHighSeconds: 300, extraLowSeconds: 60, extraHighSeconds: 180, confidence: "low",
          summary: "Typical commute: about 2 min. Allow 1–3 extra min for the Reduced Speed Zone." },
      };
      Object.assign(commute, { originStationId: "stub-eglinton", originStationName: "Eglinton",
        destinationStationId: "stub-davisville", destinationStationName: "Davisville",
        routeLabel: "Eglinton -> Davisville", path, impact });
      Object.assign(commute.outboundLeg, { routeLabel: commute.routeLabel,
        fromStationId: commute.originStationId, fromStationName: "Eglinton",
        toStationId: commute.destinationStationId, toStationName: "Davisville", path, impact });
      Object.assign(commute.returnLeg, { routeLabel: "Davisville -> Eglinton",
        fromStationId: commute.destinationStationId, fromStationName: "Davisville",
        toStationId: commute.originStationId, toStationName: "Eglinton",
        path: { ...path, stationIds: [...path.stationIds].reverse(), segmentHops: [{ ...path.segmentHops[0],
          fromStationId: "stub-davisville", toStationId: "stub-eglinton", travelDirection: "reverse" }] },
        impact: { ...commute.returnLeg.impact, travelTimeEstimate: {
          status: "standard", baselineSeconds: 120, estimatedLowSeconds: 120, estimatedHighSeconds: 120,
          extraLowSeconds: 0, extraHighSeconds: 0, confidence: "low", summary: "Typical commute: about 2 min." } },
      });
    }
  }
  return result;
}
