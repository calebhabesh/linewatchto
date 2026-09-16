import assert from "node:assert/strict";
import test from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const globalCss = readAppStylesheet();

test("narrow desktop windows reflow dense chrome without switching to mobile navigation", () => {
  assert.match(
    globalCss,
    /@media \(min-width: 768px\) and \(max-width: 1099px\)[\s\S]*?\.desktop-status-capsule-anchor\s*\{[^}]*top:\s*104px\s*!important;[^}]*width:\s*min\(680px, calc\(100vw - 32px\)\);/,
  );
  assert.match(
    globalCss,
    /@media \(min-width: 768px\) and \(max-width: 1099px\)[\s\S]*?\.floating-panel-shell\s*\{[^}]*width:\s*min\(680px, 72vw, calc\(100vw - 48px\)\);/,
  );
  assert.match(
    globalCss,
    /\.linewatch-shell:not\(\[data-active-view="map"\]\) \.desktop-status-capsule-anchor\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/,
  );
  assert.match(
    globalCss,
    /\.desktop-status-time,[\s\S]*?\.desktop-status-time \+ \.desktop-status-divider\s*\{[^}]*display:\s*none;/,
  );
});

test("condensed desktop alert badges leave room for both icon and count", () => {
  assert.match(
    globalCss,
    /\.desktop-header-impact-chips \.desktop-status-chip\s*\{[^}]*width:\s*72px;[^}]*height:\s*56px;[^}]*border-radius:\s*999px;/s,
  );
  assert.doesNotMatch(
    globalCss,
    /@media \(max-width:\s*1023px\)\s*\{\s*\.desktop-status-chip-row\s*\{[^}]*display:\s*none;/s,
  );
});

test("the smallest desktop breakpoint constrains expandable search chrome", () => {
  assert.match(
    globalCss,
    /@media \(min-width: 768px\) and \(max-width: 899px\)[\s\S]*?\.header-search-bar\s*\{[^}]*width:\s*clamp\(220px, 34vw, 270px\);/,
  );
  assert.match(
    globalCss,
    /\.header-search-bar:focus-within,[\s\S]*?\.header-search-bar\[data-active="true"\]\s*\{[^}]*width:\s*min\(var\(--desktop-global-search-width\), calc\(100vw - 240px\)\);/,
  );
});
