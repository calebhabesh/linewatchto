/**
 * Pure selection-attention controller for the geographic map.
 * Implements the system-map attention cadence:
 * - 2s intro: it eases in from what was drawn, flashes three times (peaks at
 *   0.5s, 1.1s and 1.7s) at a constant width, and the last flash falls fully
 *   before the breathe eases up from that trough
 * - 1.2s alternate breathe afterwards
 * - Static legible halo during the selection's camera flight and in fallback modes
 * - Keeps its cadence through user pans and zooms, as the System Map's pulses
 *   do (docs/map-renderer-parity.md rule 6), so a gesture never restarts it
 * - Cancellable on unmount, selection change, or style reload
 * - Rebuilds zero GeoJSON per frame (drives only paint properties)
 */

export type SelectionAttentionState =
  | "idle"
  | "camera-flight"
  | "intro"
  | "breathe"
  | "static-fallback";

export interface SelectionAttentionFrame {
  opacity: number;
  widthMultiplier: number;
  state: SelectionAttentionState;
  active: boolean;
}

interface SelectionAttentionRequest {
  id: string;
  kind?: string;
  generation: number;
  hasCameraFlight?: boolean;
  /** Linked planned/current hop: keep the running cadence instead of replaying the intro. */
  continueAttention?: boolean;
}

export const ATTENTION_INTRO_DURATION_MS = 2000;
const ATTENTION_BREATHE_DURATION_MS = 1200;

export const ATTENTION_TROUGH_OPACITY = 0.40;
export const ATTENTION_PEAK_OPACITY = 1.0;
export const ATTENTION_BREATHE_HIGH_OPACITY = 0.92;

const ATTENTION_TROUGH_WIDTH_MULTIPLIER = 1.0;
// The band keeps its width while breathing, as on the System Maps: only
// brightness pulses, so the selection never looks like it grows.
const ATTENTION_BREATHE_HIGH_WIDTH_MULTIPLIER = 1.0;

export const ATTENTION_STATIC_OPACITY = 0.90;
export const ATTENTION_STATIC_WIDTH_MULTIPLIER = 1.0;

/**
 * The intro's keyframes after its start (the System Map's
 * map-selection-path-intro): three full flashes at the breathe's starting
 * width, ending on the trough the breathe starts from.
 */
const ATTENTION_INTRO_KEYFRAMES = [
  { at: 500, opacity: ATTENTION_PEAK_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
  { at: 800, opacity: ATTENTION_TROUGH_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
  { at: 1100, opacity: ATTENTION_PEAK_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
  { at: 1400, opacity: ATTENTION_TROUGH_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
  { at: 1700, opacity: ATTENTION_PEAK_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
  { at: ATTENTION_INTRO_DURATION_MS, opacity: ATTENTION_TROUGH_OPACITY, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER },
] as const;

/** Every step eases in and out, so the first flash starts gently. */
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(t * Math.PI);

/** Opacity and width `elapsed` ms into the intro, starting from what was drawn. */
export function attentionIntroValues(
  elapsed: number,
  start: { opacity: number; width: number },
): { opacity: number; width: number } {
  let from = { at: 0, opacity: start.opacity, width: start.width };
  for (const to of ATTENTION_INTRO_KEYFRAMES) {
    if (elapsed < to.at) {
      const progress = (elapsed - from.at) / (to.at - from.at);
      const eased = easeInOut(progress);
      return {
        opacity: from.opacity + (to.opacity - from.opacity) * eased,
        width: from.width + (to.width - from.width) * eased,
      };
    }
    from = to;
  }
  return { opacity: from.opacity, width: from.width };
}

export class GeographicSelectionAttention {
  private state: SelectionAttentionState = "idle";
  private currentSelectionId: string | null = null;
  private currentGeneration = 0;
  private startTime = 0;
  private breatheBaseTime = 0;
  private flightResumesBreathe = false;
  /** What the intro eases in from: nothing for a new overlay, the flight's halo after a flight. */
  private introStart = { opacity: 0, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER };

  public getState(): SelectionAttentionState {
    return this.state;
  }

  public getGeneration(): number {
    return this.currentGeneration;
  }

  public getSelectionId(): string | null {
    return this.currentSelectionId;
  }

  /**
   * Request attention for a selection.
   * If staticFallback is true (reduced-motion, motion-paused, hidden document, mobile performance),
   * sets static fallback without starting an animation loop.
   */
  public requestAttention(
    request: SelectionAttentionRequest | null,
    staticFallback: boolean,
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
  ): SelectionAttentionFrame {
    if (!request || !request.id) {
      this.reset();
      return this.computeFrame(now);
    }

    const isNewRequest = request.generation !== this.currentGeneration;
    const isDifferentId = request.id !== this.currentSelectionId;

    if (!isNewRequest && !isDifferentId && this.state !== "idle") {
      // Same generation and same ID (e.g. passive poll update): preserve existing state
      if (staticFallback && this.state !== "static-fallback") {
        this.state = "static-fallback";
      } else if (!staticFallback && this.state === "static-fallback") {
        // Fallback cleared while still selected: join breathe
        this.state = "breathe";
        this.breatheBaseTime = now;
      }
      return this.computeFrame(now);
    }

    if (request.continueAttention && !staticFallback
      && (this.state === "intro" || this.state === "breathe")) {
      this.currentSelectionId = request.id;
      this.currentGeneration = request.generation;
      if (request.hasCameraFlight) {
        this.state = "camera-flight";
        this.flightResumesBreathe = true;
      }
      return this.computeFrame(now);
    }

    this.currentSelectionId = request.id;
    this.currentGeneration = request.generation;
    this.flightResumesBreathe = false;

    if (staticFallback) {
      this.state = "static-fallback";
      return this.computeFrame(now);
    }

    if (request.hasCameraFlight) {
      this.state = "camera-flight";
      return this.computeFrame(now);
    }

    this.state = "intro";
    this.startTime = now;
    this.introStart = { opacity: 0, width: ATTENTION_TROUGH_WIDTH_MULTIPLIER };
    return this.computeFrame(now);
  }

  /**
   * Called when camera flight finishes on moveend.
   * If generation matches and currently waiting for flight, starts the intro animation.
   */
  public onCameraFlightEnd(
    flightGeneration: number,
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
  ): SelectionAttentionFrame {
    if (this.state === "camera-flight" && flightGeneration === this.currentGeneration) {
      if (this.flightResumesBreathe) {
        this.state = "breathe";
        this.breatheBaseTime = now;
      } else {
        this.state = "intro";
        this.startTime = now;
        // The halo was drawn still through the flight; ease on from it.
        this.introStart = { opacity: ATTENTION_STATIC_OPACITY, width: ATTENTION_STATIC_WIDTH_MULTIPLIER };
      }
      this.flightResumesBreathe = false;
    }
    return this.computeFrame(now);
  }

  /**
   * Compute frame properties for current timestamp.
   */
  public computeFrame(
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
  ): SelectionAttentionFrame {
    switch (this.state) {
      case "idle":
        return {
          opacity: ATTENTION_STATIC_OPACITY,
          widthMultiplier: ATTENTION_STATIC_WIDTH_MULTIPLIER,
          state: "idle",
          active: false,
        };

      case "camera-flight":
      case "static-fallback":
        return {
          opacity: ATTENTION_STATIC_OPACITY,
          widthMultiplier: ATTENTION_STATIC_WIDTH_MULTIPLIER,
          state: this.state,
          active: false,
        };

      case "intro": {
        const elapsed = Math.max(0, now - this.startTime);
        if (elapsed >= ATTENTION_INTRO_DURATION_MS) {
          // Transition directly to breathe
          this.state = "breathe";
          this.breatheBaseTime = this.startTime + ATTENTION_INTRO_DURATION_MS;
          return this.computeFrame(now);
        }

        const { opacity, width: widthMultiplier } = attentionIntroValues(elapsed, this.introStart);

        return {
          opacity: Number(opacity.toFixed(3)),
          widthMultiplier: Number(widthMultiplier.toFixed(3)),
          state: "intro",
          active: true,
        };
      }

      case "breathe": {
        const elapsed = Math.max(0, now - this.breatheBaseTime);
        // Alternate breathe over 1.2s: full low-to-high-to-low cycle is 2.4s (2 * 1200ms)
        const fullBreatheCycleMs = ATTENTION_BREATHE_DURATION_MS * 2;
        const cycleProgress = (elapsed % fullBreatheCycleMs) / fullBreatheCycleMs;
        const breathePhase = 0.5 - 0.5 * Math.cos(cycleProgress * 2 * Math.PI);

        const opacity = ATTENTION_TROUGH_OPACITY + (ATTENTION_BREATHE_HIGH_OPACITY - ATTENTION_TROUGH_OPACITY) * breathePhase;
        const widthMultiplier = ATTENTION_TROUGH_WIDTH_MULTIPLIER + (ATTENTION_BREATHE_HIGH_WIDTH_MULTIPLIER - ATTENTION_TROUGH_WIDTH_MULTIPLIER) * breathePhase;

        return {
          opacity: Number(opacity.toFixed(3)),
          widthMultiplier: Number(widthMultiplier.toFixed(3)),
          state: "breathe",
          active: true,
        };
      }
    }
  }

  /**
   * Reset/cancel state.
   */
  public reset(): void {
    this.state = "idle";
    this.currentSelectionId = null;
    this.currentGeneration = 0;
    this.startTime = 0;
    this.breatheBaseTime = 0;
    this.flightResumesBreathe = false;
  }
}
