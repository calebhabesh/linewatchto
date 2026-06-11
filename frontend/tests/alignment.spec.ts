import { test, expect } from '@playwright/test';

test('check alignment', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Accept disclaimer if present
  try {
    await page.getByRole('button', { name: 'I Understand' }).click({ timeout: 5000 });
  } catch (e) {
    // ignore if not present
  }

  // Login via Demo account
  await page.getByRole('button', { name: 'Toggle menu' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Demo Account' }).click({ force: true });
  await page.getByRole('button', { name: 'Toggle menu' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Saved Commutes' }).click({ force: true });

  // Wait for the panel to load
  await page.waitForSelector('.saved-commute-form');

  const input = await page.locator('input[placeholder="Commute Label"]').boundingBox();
  const origin = await page.locator('.commute-station-picker').first().boundingBox();
  const toggle = await page.locator('.saved-commute-return-toggle').boundingBox();
  const checkbox = await page.locator('.saved-commute-return-toggle input').boundingBox();

  console.log("Input:", input);
  console.log("Origin:", origin);
  console.log("Toggle:", toggle);
  console.log("Checkbox:", checkbox);
});

