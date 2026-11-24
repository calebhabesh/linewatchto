import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { AnalyticsPage } from "../../analytics-page";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "GO & UP Rail Reliability Analytics",
  description: "GO and UP corridor disruption history over any range: stopped service, delays, time to clear and station-weighted shares, with the days each range could and could not count.",
  path: "/go-up/analytics",
});

export default function GoUpAnalyticsPage() {
  return <AnalyticsPage networkSlug="go-up" />;
}
