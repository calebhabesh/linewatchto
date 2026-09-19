/**
 * Pure selection-attention controller for the geographic map.
 * Implements the system-map attention cadence:
 * - 2.4s intro with four bright peaks (every 0.6s at 12.5%, 37.5%, 62.5%, 87.5%)
 * - 1.2s alternate breathe afterwards
 * - Static legible halo during camera flight, user pan/zoom gestures, and fallback modes
 * - Cancellable on unmount, selection change, or style reload
 * - Rebuilds zero GeoJSON per frame (drives only paint properties)
 */

export type SelectionAttentionState =
  | "idle"
  | "camera-flight"
  | "intro"
  | "breathe"
  | "gesture-pause"
  | "static-fallback";

export interface SelectionAttentionFrame {
  opacity: number;
  widthMultiplier: number;
  state: SelectionAttentionState;
  active: boolean;
}

export interface SelectionAttentionRequest {
  id: string;
  kind?: string;
  generation: number;
  hasCameraFlight?: boolean;
}

export const ATTENTION_INTRO_DURATION_MS = 2400;
export const ATTENTION_INTRO_CYCLE_MS = 600;
export const ATTENTION_BREATHE_DURATION_MS = 1200;

export const ATTENTION_TROUGH_OPACITY = 0.40;
export const ATTENTION_PEAK_OPACITY = 1.0;
export const ATTENTION_BREATHE_HIGH_OPACITY = 0.92;

export const ATTENTION_TROUGH_WIDTH_MULTIPLIER = 1.0;
export const ATTENTION_PEAK_WIDTH_MULTIPLIER = 1.20;
export const ATTENTION_BREATHE_HIGH_WIDTH_MULTIPLIER = 1.10;

export const ATTENTION_STATIC_OPACITY = 0.90;
export const ATTENTION_STATIC_WIDTH_MULTIPLIER = 1.0;

export class GeographicSelectionAttention {
  private state: SelectionAttentionState = "idle";
  private currentSelectionId: string | null = null;
  private currentGeneration = 0;
  private startTime = 0;
  private pauseTime = 0;
  private breatheBaseTime = 0;

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

    this.currentSelectionId = request.id;
    this.currentGeneration = request.generation;

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
      this.state = "intro";
      this.startTime = now;
    }
    return this.computeFrame(now);
  }

  /**
   * User pan or zoom gesture started. Freezes at legible static state.
   */
  public onUserGestureStart(
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
  ): SelectionAttentionFrame {
    if (this.state === "intro" || this.state === "breathe") {
      this.pauseTime = now;
      this.state = "gesture-pause";
    }
    return this.computeFrame(now);
  }

  /**
   * User pan or zoom gesture ended. Resumes at breathe phase (never replays intro).
   */
  public onUserGestureEnd(
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
  ): SelectionAttentionFrame {
    if (this.state === "gesture-pause") {
      this.state = "breathe";
      this.breatheBaseTime = now;
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
      case "gesture-pause":
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

        // 4 quick cycles over 2.4s (600ms per cycle)
        // Peaks at 12.5% (300ms), 37.5% (900ms), 62.5% (1500ms), 87.5% (2100ms)
        const cycleElapsed = elapsed % ATTENTION_INTRO_CYCLE_MS;
        const cycleProgress = cycleElapsed / ATTENTION_INTRO_CYCLE_MS;
        // Cosine wave: 0 at start/end of 600ms cycle, 1 at mid-cycle (300ms)
        const peakPhase = 0.5 - 0.5 * Math.cos(cycleProgress * 2 * Math.PI);

        const opacity = ATTENTION_TROUGH_OPACITY + (ATTENTION_PEAK_OPACITY - ATTENTION_TROUGH_OPACITY) * peakPhase;
        const widthMultiplier = ATTENTION_TROUGH_WIDTH_MULTIPLIER + (ATTENTION_PEAK_WIDTH_MULTIPLIER - ATTENTION_TROUGH_WIDTH_MULTIPLIER) * peakPhase;

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
    this.pauseTime = 0;
    this.breatheBaseTime = 0;
  }
}
