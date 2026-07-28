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
    assert.match(panelSource, /Leave Feedback/);
    assert.match(panelSource, /What could LineWatchTO make clearer or easier to use\?/);
    assert.match(panelSource, /textarea/);
    assert.match(panelSource, /MAX_FEEDBACK_MESSAGE_LENGTH/);
    assert.match(panelSource, /submitFeedback/);
    assert.match(panelSource, /buildFeedbackMailtoUrl/);
    assert.doesNotMatch(panelSource, /replyEmail|email address|Reply email/i);
  });

  it("includes quiet independent development support copy", () => {
    const panelSource = readFileSync(panelUrl, "utf8");
    assert.match(panelSource, /Support LineWatchTO/);
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

describe("feedback navigation", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

  it("adds feedback to the desktop menu and mobile More sheet", () => {
    assert.match(shellSource, /"feedback"/);
    assert.match(shellSource, /FeedbackPanel/);
    assert.match(shellSource, /NEXT_PUBLIC_LINEWATCH_SUPPORT_URL/);
    assert.match(shellSource, /Leave Feedback/);
    assert.match(shellSource, /navigateForward\("feedback"\)/);
    assert.match(moreSheetSource, /onOpenFeedback/);
    assert.match(moreSheetSource, /Leave Feedback/);
  });
});
