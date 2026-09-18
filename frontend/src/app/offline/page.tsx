import type { Metadata } from "next";
import { LineWatchShell } from "../../components/LineWatchShell";
import { fallbackDashboardData } from "../dashboard-data";
import { lineWatchBuildLabel } from "../app-build";
import { rasterMapSource } from "../map-assets";
import { lineWatchSeoTitle } from "../seo";

// Public bootstrap only: never read cookies, account data, or URL tokens here.
export const dynamic = "force-static";
export const metadata: Metadata = {
  title: { absolute: lineWatchSeoTitle },
  robots: { index: false, follow: false },
};

export default function OfflineDashboard() {
  return (
    <>
      <link rel="preload" as="fetch" crossOrigin="anonymous"
        href={`/assets/linewatch/ttc-subway-map-custom.svg?v=${lineWatchBuildLabel}`} />
      {(["background", "foreground", "labels"] as const).map((plane) => (
        <link key={plane} rel="preload" as="image"
          media="(max-width: 767px), (pointer: coarse)"
          href={rasterMapSource("ttc", plane, "dark", "mobile")} />
      ))}
      <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/assets/fonts/texgyreheros-regular.woff2" />
      <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/assets/fonts/texgyreheros-bold.woff2" />
      <LineWatchShell initialData={fallbackDashboardData()} />
    </>
  );
}
