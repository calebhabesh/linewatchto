import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../seo";
import { NetworkGuidePage } from "../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "TTC Subway & LRT Lines and Stations",
  description: "Browse TTC subway and LRT lines and mapped stations, including accessibility references, then open LineWatchTO for source-labeled current conditions.",
  path: "/ttc",
});

export default function TtcGuidePage() {
  return <NetworkGuidePage networkSlug="ttc" />;
}
