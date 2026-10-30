import assert from "node:assert/strict";
import test from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const globalCss = readAppStylesheet();

test("narrow desktop windows reflow dense chrome without switching to mobile navigation", () => {
  assert.match(
    globalCss,
    /@media \(min-width: 768px\) and \(max-width: 1099px\)[\s\S]*?\.floating-panel-shell\s*\{[^}]*width:\s*min\(680px, 72vw, calc\(100vw - 48px\)\);/,
  );
});

