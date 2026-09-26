import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  buildOgHtml,
  parseOgCliArgs,
  VALID_OG_STYLES,
} from "../../frontend/scripts/generate-og-image.mjs";

const execFileAsync = promisify(execFile);
const generatorScriptPath = new URL("../../frontend/scripts/generate-og-image.mjs", import.meta.url).pathname;
const blurWrapperPath = new URL("../../frontend/generate_og_blur.js", import.meta.url).pathname;
const glassWrapperPath = new URL("../../frontend/generate_og_glass.js", import.meta.url).pathname;

describe("generate-og-image CLI and templates", () => {
  it("parses CLI arguments and flags correctly", () => {
    const parsed = parseOgCliArgs([
      "--input", "source.png",
      "--output", "dest.png",
      "--style", "blur",
      "--width", "1200",
      "--height", "630",
    ]);

    assert.equal(parsed.input, "source.png");
    assert.equal(parsed.output, "dest.png");
    assert.equal(parsed.style, "blur");
    assert.equal(parsed.width, 1200);
    assert.equal(parsed.height, 630);
    assert.equal(parsed.help, false);
  });

  it("supports shorthand and equals syntax for options", () => {
    const parsed = parseOgCliArgs([
      "-i", "input.png",
      "-o", "output.png",
      "-s", "glass",
    ]);
    assert.equal(parsed.input, "input.png");
    assert.equal(parsed.output, "output.png");
    assert.equal(parsed.style, "glass");

    const parsedEquals = parseOgCliArgs([
      "--input=image.png",
      "--output=og.png",
      "--style=blur",
      "--width=1920",
      "--height=1080",
    ]);
    assert.equal(parsedEquals.input, "image.png");
    assert.equal(parsedEquals.output, "og.png");
    assert.equal(parsedEquals.style, "blur");
    assert.equal(parsedEquals.width, 1920);
    assert.equal(parsedEquals.height, 1080);
  });

  it("respects wrapper default styles and environment variables", () => {
    const blurDefault = parseOgCliArgs([], { defaultStyle: "blur" });
    assert.equal(blurDefault.style, "blur");

    const envParsed = parseOgCliArgs([], { defaultStyle: "glass" });
    assert.equal(envParsed.style, "glass");
  });

  it("generates faithful HTML for the glass visual preset", () => {
    const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const html = buildOgHtml({ sourceBase64: sampleBase64, style: "glass", width: 2560, height: 1440 });

    assert.match(html, /width: 2560px;/);
    assert.match(html, /height: 1440px;/);
    assert.match(html, /data:image\/png;base64,iVBORw0K/);
    assert.match(html, /filter: blur\(6px\) saturate\(145%\)/);
    assert.match(html, /tint-overlay/);
    assert.match(html, /sheen-overlay/);
    assert.match(html, /id="glass-noise"/);
    assert.match(html, /feTurbulence/);
  });

  it("generates faithful HTML for the blur visual preset", () => {
    const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const html = buildOgHtml({ sourceBase64: sampleBase64, style: "blur", width: 1200, height: 630 });

    assert.match(html, /width: 1200px;/);
    assert.match(html, /height: 630px;/);
    assert.match(html, /data:image\/png;base64,iVBORw0K/);
    assert.match(html, /filter: blur\(1\.5px\);/);
    assert.match(html, /haze-overlay/);
    assert.doesNotMatch(html, /glass-noise/);
  });

  it("displays usage and source availability statement on --help", async () => {
    const { stdout } = await execFileAsync(process.execPath, [generatorScriptPath, "--help"]);
    assert.match(stdout, /LineWatchTO OpenGraph \/ Social Preview Image Generator/);
    assert.match(stdout, /--input, -i/);
    assert.match(stdout, /--output, -o/);
    assert.match(stdout, /--style, -s/);
    assert.match(stdout, /Source Availability:/);
    assert.match(stdout, /Raw high-resolution UI captures are optional authoring inputs/);
    assert.match(stdout, /Checked-in production assets are stored in frontend\/public\/assets\/linewatch\/og-image\.png/);
  });

  it("fails with a clear message when required input is missing", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync(process.execPath, [generatorScriptPath]);
      },
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Error: Missing required input image/);
        return true;
      },
    );
  });

  it("fails with an informative error when the input file does not exist", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync(process.execPath, [generatorScriptPath, "--input", "/tmp/nonexistent-og-source-image.png"]);
      },
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Error: Source image not found/);
        assert.match(error.stderr, /Raw screenshots are optional authoring assets/);
        return true;
      },
    );
  });

  it("fails cleanly when an invalid style preset is requested", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync(process.execPath, [generatorScriptPath, "--style", "neon-rainbow", "--input", "fake.png"]);
      },
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Error: Unknown style "neon-rainbow"/);
        return true;
      },
    );
  });

  it("provides portable backward-compatible wrappers without hardcoded personal paths", async () => {
    const blurSource = readFileSync(blurWrapperPath, "utf8");
    const glassSource = readFileSync(glassWrapperPath, "utf8");

    assert.doesNotMatch(blurSource, /\/home\//);
    assert.doesNotMatch(blurSource, /ethioking/);
    assert.doesNotMatch(glassSource, /\/home\//);
    assert.doesNotMatch(glassSource, /ethioking/);

    const blurHelp = await execFileAsync(process.execPath, [blurWrapperPath, "--help"]);
    assert.equal(blurHelp.stdout.includes("LineWatchTO OpenGraph"), true);

    const glassHelp = await execFileAsync(process.execPath, [glassWrapperPath, "--help"]);
    assert.equal(glassHelp.stdout.includes("LineWatchTO OpenGraph"), true);
  });
});
