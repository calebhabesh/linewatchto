import assert from "node:assert/strict";
import { test } from "node:test";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import {
  createGeographicMapFade,
  installTransitOpacity,
  setTransitPaintProperty,
} from "../src/components/geographic-network-transition.ts";

test("network opacity affects transit artwork and preserves existing opacity without multiplying twice", () => {
  const paint = new Map([["transit-route:line-opacity", 0.4]]);
  const map = {
    getStyle: () => ({ layers: [
      { id: "base-road", type: "line" },
      { id: "transit-route", type: "line" },
      { id: "transit-stop", type: "circle" },
      { id: "transit-label", type: "symbol", layout: { "text-field": "Station" } },
    ] }),
    getPaintProperty: (layer, property) => paint.get(`${layer}:${property}`),
    setPaintProperty: (layer, property, value) => paint.set(`${layer}:${property}`, value),
  };
  installTransitOpacity(map);
  installTransitOpacity(map);
  assert.equal([...paint.keys()].some(key => key.startsWith("base-road")), false);
  assert.equal(paint.has("transit-label:icon-opacity"), false);
  assert.equal(paint.has("transit-label:text-opacity"), true);
  assert.equal(paint.has("transit-stop:circle-stroke-opacity"), true);
  const compiled = createExpression(paint.get("transit-route:line-opacity"), "paint.line-opacity");
  assert.equal(compiled.result, "success");
  assert.equal(compiled.value.evaluateWithoutErrorHandling({ zoom: 10, globalState: { "linewatch-network-opacity": 0.5 } }), 0.2);
  setTransitPaintProperty(map, "transit-route", "line-color", "#ff0000");
  assert.equal(paint.get("transit-route:line-color"), "#ff0000");
});

test("canceling a geographic fade stops its animation and reset restores all transit artwork", async t => {
  const priorRequest = globalThis.requestAnimationFrame;
  const priorCancel = globalThis.cancelAnimationFrame;
  let frame;
  let canceled;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 7; };
  globalThis.cancelAnimationFrame = id => { canceled = id; frame = undefined; };
  t.after(() => {
    globalThis.requestAnimationFrame = priorRequest;
    globalThis.cancelAnimationFrame = priorCancel;
  });
  t.mock.method(performance, "now", () => 0);
  const values = [];
  const fade = createGeographicMapFade({ getStyle: () => ({}), setGlobalStateProperty: (_key, value) => values.push(value) });
  const controller = new AbortController();
  const pending = fade.fade(0, 100, controller.signal);
  frame(50);
  assert.equal(values.at(-1), 0.25);
  controller.abort(new Error("A newer network was chosen"));
  await assert.rejects(pending, /newer network/);
  assert.equal(canceled, 7);
  assert.equal(frame, undefined);
  fade.reset();
  assert.equal(values.at(-1), 1);
});
