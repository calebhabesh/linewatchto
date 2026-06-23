import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelUrl = new URL("../src/components/FeedbackPanel.tsx", import.meta.url);
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("feedback panel UI", () => {
  it("renders a focused improvement textbox without reply collection", () => {
    assert.equal(existsSync(panelUrl), true);
    const panelSource = readFileSync(panelUrl, "utf8");
    assert.match(panelSource, /export function FeedbackPanel/);
    assert.match(panelSource, /Suggest an Improvement/);
    assert.match(panelSource, /What could LineWatch TO make clearer or easier to use\?/);
    assert.match(panelSource, /textarea/);
    assert.match(panelSource, /MAX_FEEDBACK_MESSAGE_LENGTH/);
    assert.match(panelSource, /submitFeedback/);
    assert.match(panelSource, /buildFeedbackMailtoUrl/);
    assert.doesNotMatch(panelSource, /replyEmail|email address|Reply email/i);
  });

  it("includes quiet independent development support copy", () => {
    const panelSource = readFileSync(panelUrl, "utf8");
    assert.match(panelSource, /Support LineWatch TO/);
    assert.match(panelSource, /Help keep independent transit tooling maintained\./);
    assert.match(panelSource, /supportUrl/);
    assert.doesNotMatch(panelSource, /Buy Me a Coffee|coffee|donat|tip|money/i);
  });

  it("adds scoped feedback styles", () => {
    assert.match(globalCss, /\.feedback-panel/);
    assert.match(globalCss, /\.feedback-textarea/);
    assert.match(globalCss, /\.feedback-support-card/);
    assert.match(globalCss, /\.feedback-honeypot/);
  });
});
