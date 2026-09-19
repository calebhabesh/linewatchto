import test from "node:test";
import assert from "node:assert/strict";

import {
  GeographicSelectionAttention,
  ATTENTION_INTRO_DURATION_MS,
  ATTENTION_STATIC_OPACITY,
  ATTENTION_STATIC_WIDTH_MULTIPLIER,
  ATTENTION_TROUGH_OPACITY,
  ATTENTION_PEAK_OPACITY,
  ATTENTION_BREATHE_HIGH_OPACITY,
} from "../src/app/geographic-selection-attention.ts";

test("Geographic Selection Attention Controller", async (t) => {
  await t.test("four intro peaks over 2.4s transition seamlessly into 1.2s alternate breathe", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 1000;

    const frame0 = attention.requestAttention(
      { id: "alert-1", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0,
    );

    assert.equal(frame0.state, "intro");
    assert.equal(frame0.active, true);
    assert.equal(frame0.opacity, ATTENTION_TROUGH_OPACITY);

    // Peak 1 at 300ms (12.5% of 2400ms)
    const framePeak1 = attention.computeFrame(t0 + 300);
    assert.equal(framePeak1.state, "intro");
    assert.equal(framePeak1.active, true);
    assert.equal(framePeak1.opacity, ATTENTION_PEAK_OPACITY);
    assert.equal(framePeak1.widthMultiplier, 1.2);

    // Trough 1 at 600ms
    const frameTrough1 = attention.computeFrame(t0 + 600);
    assert.equal(frameTrough1.state, "intro");
    assert.equal(frameTrough1.opacity, ATTENTION_TROUGH_OPACITY);

    // Peak 2 at 900ms (37.5% of 2400ms)
    const framePeak2 = attention.computeFrame(t0 + 900);
    assert.equal(framePeak2.opacity, ATTENTION_PEAK_OPACITY);

    // Peak 3 at 1500ms (62.5% of 2400ms)
    const framePeak3 = attention.computeFrame(t0 + 1500);
    assert.equal(framePeak3.opacity, ATTENTION_PEAK_OPACITY);

    // Peak 4 at 2100ms (87.5% of 2400ms)
    const framePeak4 = attention.computeFrame(t0 + 2100);
    assert.equal(framePeak4.opacity, ATTENTION_PEAK_OPACITY);

    // Trough at 2400ms -> transition to breathe
    const frameBreatheStart = attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS);
    assert.equal(frameBreatheStart.state, "breathe");
    assert.equal(frameBreatheStart.active, true);

    // Breathe peak at 1200ms after breathe start (t0 + 2400 + 1200 = t0 + 3600)
    const frameBreathePeak = attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS + 1200);
    assert.equal(frameBreathePeak.state, "breathe");
    assert.equal(frameBreathePeak.active, true);
    assert.equal(frameBreathePeak.opacity, ATTENTION_BREATHE_HIGH_OPACITY);
  });

  await t.test("new explicit request and same-alert reselect restart intro, while same-key poll preserves phase", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 2000;

    // First selection: starts intro
    attention.requestAttention(
      { id: "alert-1", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0,
    );
    assert.equal(attention.getState(), "intro");

    // Advance into breathe (after 3000ms)
    attention.computeFrame(t0 + 3000);
    assert.equal(attention.getState(), "breathe");

    // Same-key background poll: same ID, same generation -> MUST preserve breathe state
    attention.requestAttention(
      { id: "alert-1", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0 + 3500,
    );
    assert.equal(attention.getState(), "breathe", "Background poll must preserve ongoing breathe state");

    // Same-alert re-selection: same ID, but generation incremented -> MUST restart intro
    attention.requestAttention(
      { id: "alert-1", kind: "delay", generation: 2, hasCameraFlight: false },
      false,
      t0 + 4000,
    );
    assert.equal(attention.getState(), "intro", "Reselecting same alert with new generation restarts intro");
    const frameRestart = attention.computeFrame(t0 + 4300); // 300ms after restart
    assert.equal(frameRestart.opacity, ATTENTION_PEAK_OPACITY, "Restarts at first peak");
  });

  await t.test("camera flight coordination delays intro until moveend and ignores stale flights", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 5000;

    // Selection starts with camera flight
    const frameFlight = attention.requestAttention(
      { id: "alert-focus", kind: "delay", generation: 10, hasCameraFlight: true },
      false,
      t0,
    );
    assert.equal(frameFlight.state, "camera-flight");
    assert.equal(frameFlight.active, false, "No animation loop while camera is flying");
    assert.equal(frameFlight.opacity, ATTENTION_STATIC_OPACITY);
    assert.equal(frameFlight.widthMultiplier, ATTENTION_STATIC_WIDTH_MULTIPLIER);

    // Stale camera flight end callback (older generation) is ignored
    attention.onCameraFlightEnd(9, t0 + 400);
    assert.equal(attention.getState(), "camera-flight", "Stale flight callback must not start intro");

    // Matching camera flight end callback starts intro
    const frameArrival = attention.onCameraFlightEnd(10, t0 + 600);
    assert.equal(frameArrival.state, "intro");
    assert.equal(frameArrival.active, true, "Intro animation starts on camera arrival");

    // Peak 1 arrives 300ms after arrival (t0 + 600 + 300 = t0 + 900)
    const framePostArrivalPeak = attention.computeFrame(t0 + 900);
    assert.equal(framePostArrivalPeak.opacity, ATTENTION_PEAK_OPACITY);
  });

  await t.test("user gestures freeze at static legible state and resume at breathe without replaying intro", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 10000;

    attention.requestAttention(
      { id: "alert-gestures", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0,
    );
    assert.equal(attention.getState(), "intro");

    // User starts dragging at t0 + 400ms
    const framePause = attention.onUserGestureStart(t0 + 400);
    assert.equal(framePause.state, "gesture-pause");
    assert.equal(framePause.active, false);
    assert.equal(framePause.opacity, ATTENTION_STATIC_OPACITY);

    // User finishes dragging at t0 + 1200ms -> resumes at breathe (never replays intro)
    const frameResume = attention.onUserGestureEnd(t0 + 1200);
    assert.equal(frameResume.state, "breathe");
    assert.equal(frameResume.active, true);
  });

  await t.test("reduced-motion, motion-paused, hidden-document, and mobile-performance fallback to static halo", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 15000;

    // Request with staticFallback: true
    const frame = attention.requestAttention(
      { id: "alert-fallback", kind: "delay", generation: 1, hasCameraFlight: false },
      true,
      t0,
    );

    assert.equal(frame.state, "static-fallback");
    assert.equal(frame.active, false, "Static fallback must not start an animation loop");
    assert.equal(frame.opacity, ATTENTION_STATIC_OPACITY);
    assert.equal(frame.widthMultiplier, ATTENTION_STATIC_WIDTH_MULTIPLIER);

    // Computing frame over time remains static
    const frameLater = attention.computeFrame(t0 + 5000);
    assert.equal(frameLater.state, "static-fallback");
    assert.equal(frameLater.active, false);
    assert.equal(frameLater.opacity, ATTENTION_STATIC_OPACITY);
  });

  await t.test("reset clears selection and restores idle state", () => {
    const attention = new GeographicSelectionAttention();
    attention.requestAttention(
      { id: "alert-reset", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      1000,
    );
    assert.equal(attention.getSelectionId(), "alert-reset");

    attention.reset();
    assert.equal(attention.getState(), "idle");
    assert.equal(attention.getSelectionId(), null);
    assert.equal(attention.getGeneration(), 0);

    const frameIdle = attention.computeFrame();
    assert.equal(frameIdle.state, "idle");
    assert.equal(frameIdle.active, false);
  });
});
