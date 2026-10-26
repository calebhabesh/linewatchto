import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHOOSER_GLIDE_MS,
  MapChooserFollower,
  chooserBadgeInView,
  projectPointToCamera,
} from "../src/components/map-chooser-follow.ts";

function harness() {
  const rendered = { transform: null, translate: null };
  const flushed = [];
  const element = { style: { transform: "", transition: "", translate: "" } };
  const follower = new MapChooserFollower({
    readOffset: (_element, property) => rendered[property],
    flushStyle: (target) => flushed.push({ ...target.style }),
  });
  follower.attach(element);
  return {
    follower,
    element,
    // Flushes that committed a glide's starting offset.
    glideStarts: () => flushed.filter((style) => style.translate !== "0px 0px"),
    showOffset: (property, point) => { rendered[property] = point; },
  };
}

const translate = (x, y) => `translate3d(${x}px, ${y}px, 0px)`;

test("projects a badge through pans and zooms of the camera", () => {
  const from = { x: 100, y: 50, scale: 2 };
  assert.deepEqual(projectPointToCamera({ x: 300, y: 250 }, from, { x: 130, y: 40, scale: 2 }), { x: 330, y: 240 });
  assert.deepEqual(projectPointToCamera({ x: 300, y: 250 }, from, { x: 100, y: 50, scale: 4 }), { x: 500, y: 450 });
});

test("only a badge on screen gets a fresh placement", () => {
  assert.equal(chooserBadgeInView({ x: 10, y: 10 }, { width: 100, height: 100 }), true);
  assert.equal(chooserBadgeInView({ x: -1, y: 10 }, { width: 100, height: 100 }), false);
  assert.equal(chooserBadgeInView({ x: 10, y: 101 }, { width: 100, height: 100 }), false);
});

test("a drag moves the card with its badge without re-placing it", () => {
  const { follower, element, glideStarts } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 400, y: 120 }, { badge: { x: 600, y: 300 }, camera }, "standard", false);
  assert.equal(element.style.transform, translate(0, 0));
  assert.equal(glideStarts().length, 0, "the first placement does not glide");

  follower.setCameraTransition("none");
  assert.match(element.style.transition, /^transform 0s, translate /);
  follower.writeCamera({ x: 30, y: -12, scale: 1 });
  assert.equal(element.style.transform, translate(30, -12));
  follower.writeCamera({ x: 75, y: -40, scale: 1 });
  assert.equal(element.style.transform, translate(75, -40));
  assert.equal(element.style.translate, "0px 0px");
});

test("a zoom moves the card by its badge's displacement, not the camera's", () => {
  const { follower, element } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 0, y: 0 }, { badge: { x: 200, y: 100 }, camera }, "standard", false);
  follower.writeCamera({ x: -200, y: -100, scale: 2 });
  assert.equal(element.style.transform, translate(0, 0));
  follower.writeCamera({ x: 0, y: 0, scale: 2 });
  assert.equal(element.style.transform, translate(200, 100));
});

test("the card's transform mirrors the stage's camera transition", () => {
  const { follower, element } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 0, y: 0 }, { badge: { x: 10, y: 10 }, camera }, "standard", false);
  follower.setCameraTransition("transform 0.1s ease-out");
  follower.writeCamera({ x: 20, y: 0, scale: 1 });
  assert.match(element.style.transition, /^transform 0\.1s ease-out, translate \d+ms /);
  assert.equal(element.style.transform, translate(20, 0));
  // Interrupting the ease is mirrored too: the stage and card get the same writes.
  follower.setCameraTransition("none");
  follower.writeCamera({ x: 12, y: 0, scale: 1 });
  assert.match(element.style.transition, /^transform 0s, /);
  assert.equal(element.style.transform, translate(12, 0));
});

test("the rotated map translates the portal in its own axes and keeps the rotation", () => {
  const { follower, element } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 500, y: 40 }, { badge: { x: 100, y: 100 }, camera }, "rotated-landscape", false);
  assert.equal(element.style.transform, `${translate(0, 0)} rotate(90deg)`);
  follower.writeCamera({ x: 30, y: 10, scale: 1 });
  assert.equal(element.style.transform, `${translate(-10, 30)} rotate(90deg)`);
});

test("a new placement glides from where the card was showing", () => {
  const { follower, element, glideStarts } = harness();
  const start = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(start);
  follower.place({ x: 400, y: 120 }, { badge: { x: 600, y: 300 }, camera: start }, "standard", false);
  const settled = { x: 50, y: 20, scale: 1 };
  follower.writeCamera(settled);
  // The card shows at 450,140. The settled solve puts it at 380,200.
  follower.place({ x: 380, y: 200 }, { badge: { x: 650, y: 320 }, camera: settled }, "standard", false);
  const [glide] = glideStarts();
  assert.equal(glide.translate, "70px -60px");
  assert.equal(glide.transform, translate(0, 0));
  assert.match(glide.transition, /translate 0s/);
  assert.equal(element.style.translate, "0px 0px");
  assert.match(element.style.transition, new RegExp(`translate ${CHOOSER_GLIDE_MS}ms `));
});

test("a placement during a camera ease starts its glide from the eased position", () => {
  const { follower, glideStarts, showOffset } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 100, y: 100 }, { badge: { x: 10, y: 10 }, camera }, "standard", false);
  follower.setCameraTransition("transform 100ms ease-out");
  const target = { x: 40, y: 0, scale: 1 };
  follower.writeCamera(target);
  showOffset("transform", { x: 10, y: 0 });
  follower.place({ x: 160, y: 100 }, { badge: { x: 50, y: 10 }, camera: target }, "standard", false);
  assert.equal(glideStarts().at(-1).translate, "-50px 0px");
});

test("reduced motion and unchanged placements do not glide", () => {
  const { follower, element, glideStarts } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  const anchor = { badge: { x: 10, y: 10 }, camera };
  follower.place({ x: 100, y: 100 }, anchor, "standard", false);
  follower.place({ x: 100, y: 100 }, anchor, "standard", false);
  assert.equal(glideStarts().length, 0);
  follower.place({ x: 160, y: 100 }, anchor, "standard", true);
  assert.equal(glideStarts().length, 0);
  assert.equal(element.style.transform, translate(0, 0));
  assert.equal(element.style.translate, "0px 0px");
});

test("a drag during a glide follows the camera while the glide finishes", () => {
  const { follower, element } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 400, y: 100 }, { badge: { x: 500, y: 200 }, camera }, "standard", false);
  follower.place({ x: 300, y: 100 }, { badge: { x: 500, y: 200 }, camera }, "standard", false);
  follower.setCameraTransition("none");
  follower.writeCamera({ x: 5, y: 3, scale: 1 });
  assert.equal(element.style.transform, translate(5, 3));
  assert.equal(element.style.translate, "0px 0px");
  assert.match(element.style.transition, new RegExp(`translate ${CHOOSER_GLIDE_MS}ms `));
});

test("a map that reports badge points directly is followed the same way", () => {
  const { follower, element } = harness();
  follower.place({ x: 100, y: 100 }, { badge: { x: 300, y: 200 } }, "standard", false);
  follower.writeCamera({ x: 50, y: 50, scale: 1 });
  assert.equal(element.style.transform, translate(0, 0), "point anchors ignore camera writes");
  follower.followPoint({ x: 280, y: 240 });
  assert.equal(element.style.transform, translate(-20, 40));
});

test("detaching forgets the placement so the next card opens without a glide", () => {
  const { follower, element, glideStarts } = harness();
  const camera = { x: 0, y: 0, scale: 1 };
  follower.writeCamera(camera);
  follower.place({ x: 0, y: 0 }, { badge: { x: 10, y: 10 }, camera }, "standard", false);
  follower.attach(null);
  follower.attach(element);
  follower.place({ x: 300, y: 300 }, { badge: { x: 10, y: 10 }, camera }, "standard", false);
  assert.equal(glideStarts().length, 0);
  assert.equal(element.style.transform, translate(0, 0));
});
