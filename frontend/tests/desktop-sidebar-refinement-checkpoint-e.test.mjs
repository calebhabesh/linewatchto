import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop sidebar refinement - Checkpoint E: Wordmark and Brand Icon", () => {
  it("renders the LineWatchTO wordmark with brand font and increased icon size in the desktop sidebar header", () => {
    // Shell uses linewatch-wordmark and desktop-sidebar-wordmark with 28px logo
    assert.match(shellSource, /src="\/assets\/linewatch\/logo\.svg"[\s\S]*?width=\{28\}[\s\S]*?height=\{28\}/);
    assert.match(shellSource, /className="linewatch-wordmark desktop-sidebar-wordmark/);

    // CSS defines desktop-sidebar-wordmark with wordmark font family and prominent sizing
    assert.match(globalCss, /\.desktop-sidebar-wordmark\s*\{[^}]*font-family:\s*"Chillax",\s*var\(--font-wordmark\)/);
    assert.match(globalCss, /\.desktop-sidebar-wordmark\s*\{[^}]*font-size:\s*1\.45rem/);
    // Ensure no dark:brightness-200 filter is applied to the SVG
    assert.doesNotMatch(shellSource, /src="\/assets\/linewatch\/logo\.svg"[\s\S]*?dark:brightness-200/);
  });
});
