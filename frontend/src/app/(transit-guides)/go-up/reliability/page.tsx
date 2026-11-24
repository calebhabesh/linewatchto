import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { ReliabilityGuidePage } from "../../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "GO & UP Rail Reliability Methodology",
  description: "Learn how LineWatchTO calculates coverage-aware, station-weighted GO and UP corridor disruption classes and reliability metrics over Toronto service dates.",
  path: "/go-up/reliability",
});

export default function GoUpReliabilityPage() {
  return <ReliabilityGuidePage networkSlug="go-up" />;
}
