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
  await t.test("intro eases in, flashes three times in full, then eases into the 1.2s alternate breathe", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 1000;

    const frame0 = attention.requestAttention(
      { id: "alert-1", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0,
    );

    // A new overlay eases in from nothing rather than starting at the trough.
    assert.equal(frame0.state, "intro");
    assert.equal(frame0.active, true);
    assert.equal(frame0.opacity, 0);
    const early = attention.computeFrame(t0 + 50).opacity;
    assert.ok(early > 0 && early < 0.4, `early ${early}`);

    // Three full flashes, peaks at 500ms, 1100ms and 1700ms, at a constant width: the
    // band never looks like it grows as the flash begins.
    for (const [at, opacity] of [[500, ATTENTION_PEAK_OPACITY], [800, ATTENTION_TROUGH_OPACITY], [1100, ATTENTION_PEAK_OPACITY], [1400, ATTENTION_TROUGH_OPACITY], [1700, ATTENTION_PEAK_OPACITY]]) {
      const frame = attention.computeFrame(t0 + at);
      assert.equal(frame.state, "intro");
      assert.equal(frame.opacity, opacity, `${at}ms`);
    }
    for (let at = 0; at < 5000; at += 50) assert.equal(attention.computeFrame(t0 + at).widthMultiplier, 1, `${at}ms`);

    // The last flash falls all the way, then the breathe eases up from the trough.
    assert.equal(ATTENTION_INTRO_DURATION_MS, 2000);
    const frameBreatheStart = attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS);
    assert.equal(frameBreatheStart.state, "breathe");
    assert.equal(frameBreatheStart.opacity, ATTENTION_TROUGH_OPACITY);
    assert.ok(attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS + 100).opacity < 0.42, "breathe starts gently");

    const frameBreathePeak = attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS + 1200);
    assert.equal(frameBreathePeak.state, "breathe");
    assert.equal(frameBreathePeak.opacity, ATTENTION_BREATHE_HIGH_OPACITY);
  });

  await t.test("every intro step is small, so the cadence never jumps", () => {
    for (const hasCameraFlight of [false, true]) {
      const attention = new GeographicSelectionAttention();
      let previous = attention.requestAttention({ id: "a", generation: 1, hasCameraFlight }, false, 0).opacity;
      if (hasCameraFlight) previous = attention.onCameraFlightEnd(1, 0).opacity;
      for (let now = 16; now <= 6000; now += 16) {
        const { opacity } = attention.computeFrame(now);
        assert.ok(Math.abs(opacity - previous) < 0.08, `${hasCameraFlight ? "after flight" : "fresh"}: ${previous} -> ${opacity} at ${now}ms`);
        previous = opacity;
      }
    }
  });

  await t.test("after a camera flight the intro eases on from the still halo", () => {
    const attention = new GeographicSelectionAttention();
    attention.requestAttention({ id: "a", generation: 1, hasCameraFlight: true }, false, 0);
    const landed = attention.onCameraFlightEnd(1, 500);
    assert.equal(landed.state, "intro");
    assert.equal(landed.opacity, ATTENTION_STATIC_OPACITY);
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
    const frameRestart = attention.computeFrame(t0 + 4500); // 500ms after restart
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

    // Peak 1 arrives 500ms after arrival (t0 + 600 + 500 = t0 + 1100)
    const framePostArrivalPeak = attention.computeFrame(t0 + 1100);
    assert.equal(framePostArrivalPeak.opacity, ATTENTION_PEAK_OPACITY);
  });

  await t.test("user gestures leave the cadence running instead of restarting it", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 10000;

    attention.requestAttention(
      { id: "alert-gestures", kind: "delay", generation: 1, hasCameraFlight: false },
      false,
      t0,
    );
    // The controller has no gesture hooks: frames during and after a pan or
    // zoom follow the same clock, so the intro ends into breathe on time.
    assert.equal(typeof attention.onUserGestureStart, "undefined");
    assert.equal(attention.computeFrame(t0 + 500).opacity, ATTENTION_PEAK_OPACITY);
    const afterIntro = attention.computeFrame(t0 + 3000);
    assert.equal(afterIntro.state, "breathe");
    assert.equal(afterIntro.active, true);
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

  await t.test("linked planned/current hop keeps breathing instead of replaying the intro", () => {
    const attention = new GeographicSelectionAttention();
    const t0 = 1000;
    attention.requestAttention({ id: "parent", kind: "planned-closure", generation: 1 }, false, t0);
    assert.equal(attention.computeFrame(t0 + ATTENTION_INTRO_DURATION_MS + 100).state, "breathe");

    const hopAt = t0 + ATTENTION_INTRO_DURATION_MS + 500;
    const hop = attention.requestAttention(
      { id: "child", kind: "suspension", generation: 2, continueAttention: true },
      false,
      hopAt,
    );
    assert.equal(hop.state, "breathe");
    assert.equal(attention.getSelectionId(), "child");

    attention.requestAttention(
      { id: "parent", kind: "planned-closure", generation: 3, hasCameraFlight: true, continueAttention: true },
      false,
      hopAt + 100,
    );
    assert.equal(attention.getState(), "camera-flight");
    assert.equal(attention.onCameraFlightEnd(3, hopAt + 900).state, "breathe");

    const unrelated = attention.requestAttention({ id: "other", kind: "suspension", generation: 4 }, false, hopAt + 1000);
    assert.equal(unrelated.state, "intro");
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
