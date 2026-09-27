import { expect, test } from "@playwright/test";
import { installDismissedTransientUi } from "./test-support";

test("mobile display switches toggle with touch and keyboard", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();

  for (const name of ["High Contrast Mode", "Reduced Motion", "Constellation Background"]) {
    const control = page.getByRole("switch", { name, exact: true });
    const initial = await control.isChecked();
    await expect(control).toHaveAttribute("type", "checkbox");
    await control.tap();
    await expect(control).toBeChecked({ checked: !initial });
    await page.reload();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(control).toBeChecked({ checked: !initial });
    await control.press("Space");
    await expect(control).toBeChecked({ checked: initial });
  }
});

test("turning reduced motion off does not replay the open More sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();

  const control = page.getByRole("switch", { name: "Reduced Motion", exact: true });
  if (!(await control.isChecked())) await control.tap();
  await expect(control).toBeChecked();

  const panel = page.locator(".mobile-more-sheet");
  await panel.evaluate(element => {
    (window as Window & { originalMorePanel?: Element }).originalMorePanel = element;
  });
  await control.tap();
  await expect(control).not.toBeChecked();
  await expect.poll(() => page.locator(".mobile-view-content-wrapper").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await expect.poll(() => page.locator(".floating-panel-shell").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect(await panel.evaluate(element => element === (window as Window & { originalMorePanel?: Element }).originalMorePanel)).toBe(true);
});
