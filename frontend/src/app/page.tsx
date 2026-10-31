import { rasterMapSource } from "./map-assets";
import { MAP_MANIFESTS, NETWORK_MAPS, mapArtworkUrl } from "./map-manifests";
import { lineWatchBuildLabel } from "./app-build";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LineWatchDevBootstrap } from "../components/LineWatchDevBootstrap";
import { JsonLd } from "../components/JsonLd";
import { fallbackDashboardData } from "./dashboard-data";
import { regionalDashboardData } from "./regional-data";
import { buildLineWatchWebsiteStructuredData, lineWatchSeoTitle } from "./seo";
import {
  initialVisualPreferencesFromCookie,
  VISUAL_PREFERENCES_COOKIE_NAME,
} from "./visual-preferences";

export const metadata: Metadata = {
  title: { absolute: lineWatchSeoTitle },
};

export default async function Home() {
  const cookieStore = await cookies();
  const initialVisualPreferences = initialVisualPreferencesFromCookie(
    cookieStore.get(VISUAL_PREFERENCES_COOKIE_NAME)?.value,
  );
  const initialData = initialVisualPreferences.defaultNetwork === "regional"
    ? regionalDashboardData
    : fallbackDashboardData();
  const initialMap = MAP_MANIFESTS[NETWORK_MAPS[initialVisualPreferences.defaultNetwork]];

  return (
    <>
      <link rel="preload" as="fetch" crossOrigin="anonymous"
        href={`${mapArtworkUrl(initialMap)}?v=${lineWatchBuildLabel}`} />
      {(["background", "foreground", "labels"] as const).map((plane) => (
        <link key={plane} rel="preload" as="image"
          media="(max-width: 767px), (pointer: coarse)"
          href={rasterMapSource(initialMap.id, plane,
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
