import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../seo";
import { NetworkGuidePage } from "../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "GO Transit & UP Express Corridors and Stations",
  description: "Browse mapped GO rail corridors, UP Express, and regional stations, then open LineWatchTO for freshness-gated service and reliability information.",
  path: "/go-up",
});

export default function GoUpGuidePage() {
  return <NetworkGuidePage networkSlug="go-up" />;
}
