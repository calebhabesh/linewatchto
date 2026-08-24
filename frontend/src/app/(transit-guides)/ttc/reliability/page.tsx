import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { ReliabilityGuidePage } from "../../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "TTC Subway Reliability Methodology",
  description: "Learn how LineWatchTO calculates coverage-aware 30-day TTC line and station disruption metrics from observed, normalized alert lifecycles.",
  path: "/ttc/reliability",
});

export default function TtcReliabilityPage() {
  return <ReliabilityGuidePage networkSlug="ttc" />;
}
