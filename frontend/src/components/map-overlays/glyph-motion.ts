/**
 * Glyph ripple: a light swell along the direction arrows of one-way line
 * alerts (Reduced Speed Zone chevrons, both lanes of a two-way zone, and the
 * arrows between a one-way delay's hourglasses, a one-way suspension's
 * no-entry signs and a one-way planned closure's calendars) on the System
 * Maps, on desktop. Icons and two-way delays, suspensions and closures stay
 * still.
 *
 * On by default. It stops when the rider turns on Reduce Animations in
 * Settings (.motion-paused on the shell), under the system reduced-motion
 * preference, in mobile performance mode, and without a fine pointer (phones),
 * the same gates as the other map animations (impact-overlays.css applies
 * them in CSS too).
 *
 * Glyphs never move. Each arrow carries a phase that counts up the way the
 * alert travels. One shared timer advances each lane's --ripple-tick once per
 * step through one wave (glyphRipplePhase, rippleCycle) and CSS swells the
 * arrow whose phase the tick reaches, so a single wave travels the alert's
 * way. Only paint properties change, no layers.
 *
 * "ripple" (the default) eases each step with a CSS transition: work runs
 * while arrows ease, only for lanes on screen (an IntersectionObserver culls
 * the rest, and lanes in the hidden network's map are skipped), and only
 * while the on-screen arrows fit EASED_ARROW_BUDGET; above it the ripple
 * steps (no per-frame work between steps). "ripple-stepped" always steps. It
 * keeps running while the camera moves (desktop map animations do;
 * base-map.css). The timer skips steps while the tab is hidden or a gate
 * fails.
 *
 * Developer overrides from the URL (remembered in localStorage):
 *   ?glyphMotion=ripple-stepped   stepped ripple
 *   ?glyphMotion=off              still glyphs (tests and comparisons)
 *   ?glyphMotion=ripple           back to the default
 *   &rippleStep=550               milliseconds per step (80-1000)
 */

/**
 * One wave runs through a lane, then rests GLYPH_RIPPLE_REST_STEPS steps
 * before the next. A lane longer than GLYPH_RIPPLE_WAVE_SPAN arrows (a long
 * corridor) carries a wave every WAVE_SPAN arrows instead, so most of it is
 * not still for a whole minute between waves.
 */
export const GLYPH_RIPPLE_WAVE_SPAN = 16;
const GLYPH_RIPPLE_REST_STEPS = 2;

/** An arrow's phase from its order along the lane's travel. */
export function glyphRipplePhase(ordinal: number) {
  return ordinal % GLYPH_RIPPLE_WAVE_SPAN;
}

function rippleCycle(arrows: number) {
  return arrows > GLYPH_RIPPLE_WAVE_SPAN ? GLYPH_RIPPLE_WAVE_SPAN : arrows + GLYPH_RIPPLE_REST_STEPS;
}
/** Most arrows that ease at once; more on screen and the ripple steps. */
export const EASED_ARROW_BUDGET = 160;

const MODE_KEY = "linewatch-glyph-motion-v1";
const STEP_KEY = "linewatch-glyph-motion-step-v1";
const MODES = new Set(["ripple", "ripple-stepped"]);
const DEFAULT_MODE = "ripple";
const DEFAULT_STEP_MS = 550;
// Must match the media gate in impact-overlays.css.
const DESKTOP_MOTION_QUERY = "(hover: hover) and (pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)";

let installed = false;
let mode: string | null = null;
let stepMs = DEFAULT_STEP_MS;
let desktopMotion: MediaQueryList | null = null;
let timer: number | undefined;
let observer: IntersectionObserver | null = null;
const lanes = new Map<SVGGElement, { arrows: number; visible: boolean; tick: number; cycle: number }>();

function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the URL still applies for this page load.
  }
}

/** Applies the ripple's mode and step to <html> once per page load. */
export function installGlyphMotion() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("glyphMotion");
  if (requestedMode !== null) {
    // Only a developer "off" (or "ripple-stepped") is remembered; anything else returns to the default.
    writeStored(MODE_KEY, requestedMode === "off" || (MODES.has(requestedMode) && requestedMode !== DEFAULT_MODE)
      ? requestedMode
      : null);
  }
  const requestedStep = params.get("rippleStep");
  if (requestedStep !== null) writeStored(STEP_KEY, requestedStep);

  const stored = readStored(MODE_KEY);
  const root = document.documentElement;
  if (stored === "off") {
    delete root.dataset.glyphMotion;
    return;
  }
  mode = stored && MODES.has(stored) ? stored : DEFAULT_MODE;
  const step = Number(readStored(STEP_KEY));
  stepMs = Number.isFinite(step) && step >= 80 && step <= 1000 ? step : DEFAULT_STEP_MS;
  desktopMotion = window.matchMedia(DESKTOP_MOTION_QUERY);
  root.style.setProperty("--glyph-ripple-step", `${stepMs}ms`);
  root.dataset.glyphMotion = mode;
}

function rippleAllowed() {
  if (document.hidden || !desktopMotion?.matches) return false;
  const shell = document.querySelector(".linewatch-shell");
  return Boolean(shell && !shell.classList.contains("motion-paused") && !shell.classList.contains("mobile-performance-mode"));
}

function advance() {
  if (!rippleAllowed()) return;
  let visibleArrows = 0;
  for (const [lane, state] of lanes) {
    // The other network's map stays mounted but hidden (NetworkMap's
    // data-preparing layer); intersection observers still count it.
    if (!state.visible || lane.closest("[data-preparing]")) continue;
    visibleArrows += state.arrows;
    state.tick = (state.tick + 1) % state.cycle;
    lane.style.setProperty("--ripple-tick", String(state.tick));
  }
  // Ease only while the arrows on screen fit the budget; set before the
  // step's styles resolve, so a step is either eased or not as a whole.
  const eased = mode === "ripple" && visibleArrows <= EASED_ARROW_BUDGET ? "true" : "false";
  if (document.documentElement.dataset.glyphRippleEased !== eased) {
    document.documentElement.dataset.glyphRippleEased = eased;
  }
}

function laneObserver() {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const state = lanes.get(entry.target as SVGGElement);
      if (state) state.visible = entry.isIntersecting;
    }
  });
  return observer;
}

/** Adds a lane of `arrows` ripple arrows to the shared clock; returns its removal. */
export function registerGlyphRippleLane(lane: SVGGElement, arrows: number) {
  if (mode === null || arrows === 0) return () => undefined;
  lanes.set(lane, { arrows, visible: false, tick: 0, cycle: rippleCycle(arrows) });
  lane.style.setProperty("--ripple-tick", "0");
  laneObserver().observe(lane);
  if (timer === undefined) timer = window.setInterval(advance, stepMs);
  return () => {
    lanes.delete(lane);
    observer?.unobserve(lane);
    if (lanes.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}
