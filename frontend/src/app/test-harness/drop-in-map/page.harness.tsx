/*
 * Test harness route for the drop-in fixture map (plan 10 phase 6). A
 * `.harness.tsx` file is a page only in builds with LINEWATCH_TEST_HARNESS=true
 * (next.config.ts `pageExtensions`; the Playwright build sets it), so it never
 * ships to riders.
 */
import type { Metadata } from "next";
import { DropInMapHarness } from "../../../../tests/fixtures/drop-in-map/DropInMapHarness";

export const metadata: Metadata = { title: "Drop-in map harness", robots: { index: false } };

export default function DropInMapHarnessPage() {
  return <DropInMapHarness />;
}
