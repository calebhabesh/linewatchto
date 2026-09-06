import { rasterMapSource } from "./map-assets";
import { lineWatchBuildLabel } from "./app-build";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LineWatchDevBootstrap } from "../components/LineWatchDevBootstrap";
import { JsonLd } from "../components/JsonLd";
import { loadDashboardInitialData } from "./dashboard-data";
import { buildLineWatchWebsiteStructuredData, lineWatchSeoTitle } from "./seo";
import {
  initialVisualPreferencesFromCookie,
  VISUAL_PREFERENCES_COOKIE_NAME,
} from "./visual-preferences";

export const metadata: Metadata = {
  title: { absolute: lineWatchSeoTitle },
};

export default async function Home() {
  const initialData = await loadDashboardInitialData();
  const cookieStore = await cookies();
  const initialVisualPreferences = initialVisualPreferencesFromCookie(
    cookieStore.get(VISUAL_PREFERENCES_COOKIE_NAME)?.value,
  );

  return (
    <>
      <link rel="preload" as="fetch" crossOrigin="anonymous"
        href={`/assets/linewatch/${initialVisualPreferences.defaultNetwork === "regional" ? "regional-rail-map" : "ttc-subway-map-custom"}.svg?v=${lineWatchBuildLabel}`} />
      {(["background", "foreground", "labels"] as const).map((plane) => (
        <link key={plane} rel="preload" as="image"
          media="(max-width: 767px), (pointer: coarse)"
          href={rasterMapSource(initialVisualPreferences.defaultNetwork, plane,
            initialVisualPreferences.highContrast ? "high-contrast" : initialVisualPreferences.theme, "mobile")} />
      ))}
      <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/assets/fonts/texgyreheros-regular.woff2" />
      <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/assets/fonts/texgyreheros-bold.woff2" />
      <JsonLd data={buildLineWatchWebsiteStructuredData()} />
      <LineWatchDevBootstrap
        initialData={initialData}
        initialVisualPreferences={initialVisualPreferences}
      />
    </>
  );
}
