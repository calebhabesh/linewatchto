import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("GO/UP raster labels stay aligned with their SVG hover layer through a pan", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "This projection check uses the unrotated desktop map.");
  await installDismissedTransientUi(page);
  await page.addInitScript(() => {
    localStorage.setItem("linewatch-default-network-v1", "regional");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

  // Moving the map changes the camera transform, but both paint paths must
  // still map every row of label pixels to the same screen position.
  const viewport = page.locator(".regional-map-viewport");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + bounds!.height * 0.65, { steps: 6 });
  await page.mouse.up();

  const verticalOffset = await page.evaluate(() => {
    const stage = document.querySelector(".regional-map-stage");
    const labels = stage?.querySelector<HTMLImageElement>("img.raster-map-plane--labels");
    const hoverSvg = stage?.querySelector<SVGSVGElement>("svg.raster-map-top-plane");
    if (!labels || !hoverSvg || !hoverSvg.viewBox.baseVal) return null;

    const imageBox = labels.getBoundingClientRect();
    const svgBox = hoverSvg.getBoundingClientRect();
    const svgViewBox = hoverSvg.viewBox.baseVal;
    const svgScale = Math.min(svgBox.width / svgViewBox.width, svgBox.height / svgViewBox.height);
    const svgPaintHeight = svgViewBox.height * svgScale;
    const svgPaintTop = svgBox.top + (svgBox.height - svgPaintHeight) / 2;

    const objectFit = getComputedStyle(labels).objectFit;
    const imageScale = objectFit === "contain"
      ? Math.min(imageBox.width / labels.naturalWidth, imageBox.height / labels.naturalHeight)
      : null;
    const imagePaintHeight = imageScale === null ? imageBox.height : labels.naturalHeight * imageScale;
    const imagePaintTop = imageBox.top + (imageBox.height - imagePaintHeight) / 2;

    return Math.max(
      ...[0.25, 0.75].map((fraction) => Math.abs(
        imagePaintTop + imagePaintHeight * fraction - (svgPaintTop + svgPaintHeight * fraction),
      )),
    );
  });

  expect(verticalOffset).not.toBeNull();
  expect(verticalOffset!).toBeLessThan(0.5);
});
