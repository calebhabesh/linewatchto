import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyWheelInput,
  MapCameraMotion,
  MOMENTUM_MAX_SPEED,
  releaseVelocity,
  WHEEL_COMMIT_DELAY_MS,
  WHEEL_EASE_MS,
  wheelPixelDelta,
  wheelZoomFactor,
} from "../src/components/map-camera/camera-motion.ts";

const notch = (deltaY) => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false });
const scroll = (deltaY) => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false });
const pinch = (deltaY) => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: true });

/** A manual clock for animation frames and timers. */
function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  return {
    scheduler: {
      request: (callback) => { const id = nextId++; frames.set(id, callback); return id; },
      cancel: (id) => { frames.delete(id); },
      setTimer: (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id; },
      clearTimer: (id) => { timers.delete(id); },
    },
    get now() { return now; },
    get pendingFrames() { return frames.size; },
    /** Advances in 16 ms frames, firing due timers between frames. */
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        for (const [id, timer] of [...timers]) {
          if (timer.at <= now) { timers.delete(id); timer.callback(); }
        }
        const due = [...frames];
        frames.clear();
        for (const [, callback] of due) callback(now);
      }
    },
  };
}

function cameraHost(overrides = {}) {
  const log = [];
  const host = {
    camera: { x: 0, y: 0, scale: 1 },
    writes: 0,
    readCamera: () => host.camera,
    writeCamera: (camera) => { host.camera = camera; host.writes++; },
    ease: null,
    setCameraEase: (ms) => { host.ease = ms; log.push(`ease ${ms}`); },
    clampScale: (scale) => Math.min(8, Math.max(0.25, scale)),
    easeWheelZoom: () => true,
    momentum: () => true,
    onZoomStart: () => log.push("zoom-start"),
    onZoomEnd: () => log.push("zoom-end"),
    onGlideEnd: () => log.push("glide-end"),
    log,
    ...overrides,
  };
  return host;
}

describe("wheel classification", () => {
  it("tells mouse-wheel notches from trackpad scrolls and pinches", () => {
    assert.equal(classifyWheelInput(notch(100)), "notch");
    assert.equal(classifyWheelInput(notch(-120)), "notch");
    assert.equal(classifyWheelInput({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false }), "notch");
    assert.equal(classifyWheelInput({ deltaX: 0, deltaY: 4.000244140625 * 4, deltaMode: 0, ctrlKey: false }), "notch");
    assert.equal(classifyWheelInput(scroll(3.5)), "scroll");
    assert.equal(classifyWheelInput(scroll(12)), "scroll");
    assert.equal(classifyWheelInput({ deltaX: 2, deltaY: 60, deltaMode: 0, ctrlKey: false }), "scroll");
    assert.equal(classifyWheelInput(pinch(100)), "pinch");
  });

  it("zooms the same distance for a notch and a scroll, symmetric in and out", () => {
    assert.ok(Math.abs(wheelZoomFactor("notch", -100) - 1.1) < 1e-9);
    assert.ok(Math.abs(wheelZoomFactor("notch", 100) * wheelZoomFactor("notch", -100) - 1) < 1e-9);
    assert.equal(wheelZoomFactor("scroll", -37), wheelZoomFactor("notch", -37));
    // A Chrome trackpad pinch follows the fingers: deltaY = 100 × ln(1 / scale).
    assert.ok(Math.abs(wheelZoomFactor("pinch", -100 * Math.log(1.5)) - 1.5) < 1e-9);
  });

  it("converts line and page deltas to pixels and caps runaway events", () => {
    assert.equal(wheelPixelDelta({ deltaY: 3, deltaMode: 1 }), 120);
    assert.equal(wheelPixelDelta({ deltaY: 1, deltaMode: 2 }), 500);
    assert.equal(wheelPixelDelta({ deltaY: -9000, deltaMode: 0 }), -500);
  });
});

describe("wheel zoom motion", () => {
  it("eases each notch to its target around the pointer with one transition, then commits once", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    const pointer = { x: 400, y: 300 };

    motion.wheel(notch(-100), pointer, 0);
    clock.advance(32);
    motion.wheel(notch(-100), pointer, 32);
    assert.deepEqual(host.log, ["zoom-start", `ease ${WHEEL_EASE_MS}`], "the transition is set once");
    assert.ok(Math.abs(host.camera.scale - 1.21) < 1e-9, "notches compound on the target");
    // The map point under the pointer stays under it.
    assert.ok(Math.abs((pointer.x - host.camera.x) / host.camera.scale - pointer.x) < 1e-6);
    assert.equal(clock.pendingFrames, 0, "no per-frame scale writes");

    clock.advance(WHEEL_EASE_MS);
    assert.deepEqual(host.log, ["zoom-start", `ease ${WHEEL_EASE_MS}`, "zoom-end"]);
    assert.equal(motion.isZooming(), false);
  });

  it("does not commit while the last ease is still landing", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(notch(-100), { x: 0, y: 0 }, 0);
    clock.advance(WHEEL_COMMIT_DELAY_MS + 16);
    assert.ok(WHEEL_EASE_MS > WHEEL_COMMIT_DELAY_MS + 16);
    assert.deepEqual(host.log, ["zoom-start", `ease ${WHEEL_EASE_MS}`]);
    clock.advance(WHEEL_EASE_MS);
    assert.equal(host.log.at(-1), "zoom-end");
  });

  it("applies trackpad scrolls and pinches directly and commits after the quiet delay", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(scroll(-4), { x: 10, y: 10 }, 0);
    assert.ok(host.camera.scale > 1);
    motion.wheel(pinch(-100 * Math.log(2)), { x: 10, y: 10 }, 8);
    assert.ok(Math.abs(host.camera.scale - 2 * wheelZoomFactor("scroll", -4)) < 1e-9);
    assert.deepEqual(host.log, ["zoom-start", "ease 0"]);
    clock.advance(WHEEL_COMMIT_DELAY_MS - 20);
    assert.equal(host.log.at(-1), "ease 0");
    clock.advance(40);
    assert.equal(host.log.at(-1), "zoom-end");
  });

  it("eases a scroll that arrives while a notch is still easing", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(notch(-100), { x: 0, y: 0 }, 0);
    motion.wheel(pinch(-10), { x: 0, y: 0 }, 50);
    assert.equal(host.ease, WHEEL_EASE_MS);
    clock.advance(WHEEL_EASE_MS + 60);
    motion.wheel(pinch(-10), { x: 0, y: 0 }, clock.now);
    assert.equal(host.ease, 0, "a pinch after the ease has landed applies at once");
  });

  it("keeps a trackpad flick a scroll even when an event looks like a notch", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(scroll(-8.5), { x: 0, y: 0 }, 0);
    motion.wheel(notch(-60), { x: 0, y: 0 }, 10);
    assert.equal(host.ease, 0, "applied at once, not eased");
  });

  it("applies notches at once under reduced motion", () => {
    const clock = fakeScheduler();
    const host = cameraHost({ easeWheelZoom: () => false });
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(notch(-100), { x: 0, y: 0 }, 0);
    assert.ok(Math.abs(host.camera.scale - 1.1) < 1e-9);
    assert.equal(host.ease, 0);
  });

  it("clamps the target to the map's zoom range", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    for (let i = 0; i < 40; i++) motion.wheel(notch(-100), { x: 0, y: 0 }, i * 10);
    assert.equal(host.camera.scale, 8);
  });

  it("commits when stopped mid-ease", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    motion.wheel(notch(-300), { x: 0, y: 0 }, 0);
    motion.stopZoom();
    assert.equal(host.log.at(-1), "zoom-end");
    clock.advance(500);
    assert.equal(host.log.filter((entry) => entry === "zoom-end").length, 1);
  });
});

describe("drag momentum", () => {
  const drag = (motion, from, to, start, end, step = 8) => {
    for (let t = start; t <= end; t += step) {
      const p = (t - start) / (end - start);
      motion.trackPointer({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }, t);
    }
  };

  it("glides on in the release direction, slows, and commits once", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    drag(motion, { x: 0, y: 0 }, { x: 100, y: 0 }, 0, 100);
    host.camera = { x: 100, y: 0, scale: 1 };
    assert.equal(motion.release(105), true);
    clock.advance(100);
    const early = host.camera.x;
    assert.ok(early > 100);
    clock.advance(4000);
    const travelled = host.camera.x - 100;
    // 1 px/ms with a 200 ms time constant travels about 200 px.
    assert.ok(travelled > 185 && travelled < 205, `travelled ${travelled}`);
    assert.equal(host.camera.y, 0);
    assert.deepEqual(host.log, ["ease 0", "glide-end"], "glides with no transition");
    assert.equal(motion.isGliding(), false);
  });

  it("does not glide after the pointer stopped, a slow drag, or under reduced motion", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    drag(motion, { x: 0, y: 0 }, { x: 100, y: 0 }, 0, 100);
    assert.equal(motion.release(260), false, "held still before release");

    drag(motion, { x: 0, y: 0 }, { x: 10, y: 0 }, 0, 100);
    assert.equal(motion.release(101), false, "0.1 px/ms is a placement, not a fling");

    const reduced = new MapCameraMotion(cameraHost({ momentum: () => false }), clock.scheduler);
    drag(reduced, { x: 0, y: 0 }, { x: 100, y: 0 }, 0, 100);
    assert.equal(reduced.release(101), false);
  });

  it("caps the release speed", () => {
    const samples = [{ x: 0, y: 0, time: 0 }, { x: 5000, y: 0, time: 50 }];
    const velocity = releaseVelocity(samples, 50);
    assert.ok(Math.abs(velocity.x - MOMENTUM_MAX_SPEED) < 1e-9);
  });

  it("a press or a wheel stops the glide where it is drawn", () => {
    const clock = fakeScheduler();
    const host = cameraHost();
    const motion = new MapCameraMotion(host, clock.scheduler);
    drag(motion, { x: 0, y: 0 }, { x: 0, y: 200 }, 0, 100);
    motion.release(100);
    clock.advance(64);
    const drawn = host.camera.y;
    assert.equal(motion.stopGlide(), true);
    assert.equal(motion.stopGlide(), false);
    clock.advance(500);
    assert.equal(host.camera.y, drawn);

    drag(motion, { x: 0, y: 0 }, { x: 0, y: 200 }, 1000, 1100);
    motion.release(1100);
    clock.advance(32);
    motion.wheel(notch(-100), { x: 0, y: 0 }, clock.now);
    assert.deepEqual(host.log.filter((entry) => !entry.startsWith("ease")), ["glide-end", "glide-end", "zoom-start"]);
  });
});
