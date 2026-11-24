import { AnalyticsDashboard } from "../../components/analytics/AnalyticsDashboard";
import { JsonLd } from "../../components/JsonLd";
import { getLineWatchSiteOrigin } from "../seo";
import {
  regionalGuideRoutes,
  stationsForGuideRoute,
  ttcGuideRoutes,
  type TransitGuideNetworkSlug,
} from "../transit-guide-data";
import styles from "./transit-guide.module.css";

/** The shell is prerendered and holds no readings; the dashboard fetches them in the browser. */
export function AnalyticsPage({ networkSlug }: { networkSlug: TransitGuideNetworkSlug }) {
  const ttc = networkSlug === "ttc";
  const title = ttc ? "TTC Subway & LRT" : "GO Transit & UP Express";
  const lines = (ttc ? ttcGuideRoutes : regionalGuideRoutes).map((route) => ({
    id: route.id,
    number: route.number,
    name: route.name,
    stations: stationsForGuideRoute(route).map((station) => ({ id: station.id, name: station.name })),
  }));

  return (
    <main className={styles.main}>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${title} Reliability Analytics`,
        url: new URL(`/${networkSlug}/analytics`, getLineWatchSiteOrigin()).toString(),
      }} />
      <AnalyticsDashboard networkId={ttc ? "ttc" : "regional"} title={title} lines={lines} />
    </main>
  );
}
