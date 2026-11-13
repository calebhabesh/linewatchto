import type { Page } from "@playwright/test";

/**
 * PROTOTYPE scenarios for the glyph ripple (glyph-motion-prototype.ts): every
 * segment of a network carries one alert of a single kind and direction, so
 * each scenario shows one overlay variant everywhere it can draw.
 */

export type RippleScenario =
  | "rsz-one-way"
  | "rsz-two-way"
  | "delay-one-way"
  | "suspension-one-way"
  | "planned-one-way"
  | "delay-two-way";

export const RIPPLE_SCENARIOS: RippleScenario[] = [
  "rsz-one-way",
  "rsz-two-way",
  "delay-one-way",
  "suspension-one-way",
  "planned-one-way",
  "delay-two-way",
];

/** Scenarios whose arrows ripple; the rest must stay still. */
export const RIPPLING_SCENARIOS = new Set<RippleScenario>([
  "rsz-one-way",
  "rsz-two-way",
  "delay-one-way",
  "suspension-one-way",
  "planned-one-way",
]);

type Body = Record<string, unknown> & { map: { segments: Array<Record<string, unknown>> } };

const CARD_ID = "prototype-ripple-everywhere";
const SOURCE_IDS = ["prototype-ripple-everywhere-source"];

function card(segments: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    id: CARD_ID,
    lineId: segments[0]?.lineId ?? "line-1",
    lineNumber: "1",
    title: "Prototype ripple scenario",
    location: "Every segment",
    displayDirection: "Southbound",
    description: "Prototype stress case.",
    reason: "Prototype",
    targetRemoval: "",
    updatedAgo: "Updated now",
    affectedSegmentIds: segments.map((segment) => segment.id),
    sourceAlertIds: SOURCE_IDS,
    directionalDetails: [],
    source: "Playwright API stub",
    ...extra,
  };
}

function withEverySegment(body: Body, kind: string, travelDirection: string) {
  // Runs after the reset in installRippleScenario.
  body.map.segments = body.map.segments.map((segment) => ({
    ...segment,
    impacts: [{ kind, cardId: CARD_ID, travelDirection, sourceAlertIds: SOURCE_IDS }],
    overlay: kind === "suspension" ? "suspension" : "delay",
    travelDirection,
    sourceAlertIds: SOURCE_IDS,
    reducedSpeedZoneIds: kind === "reduced-speed-zone" ? [CARD_ID] : [],
    alertId: kind === "reduced-speed-zone" ? null : CARD_ID,
  }));
}

/** Rewrites the network's dashboard so every segment shows `scenario`. */
export async function installRippleScenario(page: Page, network: "ttc" | "regional", scenario: RippleScenario) {
  await page.route(`**/api/dashboard?network=${network}*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as Body;
    const segments = body.map.segments;
    // TTC's stub lists a current closure first; previews need an upcoming one.
    const closures = (body.plannedClosures as Array<Record<string, unknown>> | undefined) ?? [];
    const upcoming = closures.find((closure) => String(closure.id).includes("upcoming")) ?? closures[0];
    body.delays = [];
    body.activeAlerts = [];
    body.reducedSpeedZones = [];
    body.plannedClosures = [];
    // Clear every segment first: a segment's own overlay draws even without impacts.
    body.map.segments = segments.map((segment) => ({
      ...segment,
      impacts: [],
      overlay: "clear",
      travelDirection: "bidirectional",
      sourceAlertIds: [],
      reducedSpeedZoneIds: [],
      alertId: null,
    }));
    switch (scenario) {
      case "rsz-one-way":
      case "rsz-two-way":
        withEverySegment(body, "reduced-speed-zone", scenario === "rsz-one-way" ? "forward" : "bidirectional");
        body.reducedSpeedZones = [card(segments)];
        break;
      case "delay-one-way":
      case "delay-two-way": {
        const travelDirection = scenario === "delay-one-way" ? "forward" : "bidirectional";
        withEverySegment(body, "delay", travelDirection);
        body.delays = [card(segments, { travelDirection })];
        break;
      }
      case "suspension-one-way":
        withEverySegment(body, "suspension", "forward");
        body.activeAlerts = [card(segments, { kind: "suspension", travelDirection: "forward", severity: "major" })];
        break;
      case "planned-one-way":
        // An upcoming closure previewed over every segment, one way.
        if (upcoming) {
          body.plannedClosures = [{
            ...upcoming,
            travelDirection: "forward",
            previewSegmentIds: segments.map((segment) => segment.id),
          }];
        }
        break;
    }
    await route.fulfill({ response, json: body });
  });
}
