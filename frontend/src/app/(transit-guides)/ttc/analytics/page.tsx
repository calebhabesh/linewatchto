import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { AnalyticsPage } from "../../analytics-page";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "TTC Subway Reliability Analytics",
  description: "TTC subway and LRT disruption history over any range: stopped service, delays, time to clear and station-weighted shares, with the days each range could and could not count.",
  path: "/ttc/analytics",
});

export default function TtcAnalyticsPage() {
  return <AnalyticsPage networkSlug="ttc" />;
}
