import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../../seo";
import { ReliabilityGuidePage } from "../../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "GO & UP Rail Reliability Methodology",
  description: "Learn how LineWatchTO calculates coverage-aware 30-day GO and UP corridor and station disruption metrics from observed alert lifecycles.",
  path: "/go-up/reliability",
});

export default function GoUpReliabilityPage() {
  return <ReliabilityGuidePage networkSlug="go-up" />;
}
