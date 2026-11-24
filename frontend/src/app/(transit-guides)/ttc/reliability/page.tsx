import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { ReliabilityGuidePage } from "../../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "TTC Subway Reliability Methodology",
  description: "Learn how LineWatchTO calculates coverage-aware, station-weighted TTC disruption classes and reliability metrics over Toronto service dates.",
  path: "/ttc/reliability",
});

export default function TtcReliabilityPage() {
  return <ReliabilityGuidePage networkSlug="ttc" />;
}
