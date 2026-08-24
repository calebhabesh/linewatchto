import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../seo";
import { ExploreGuidePage } from "../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "Toronto Transit Lines, Stations & Reliability",
  description: "Explore TTC subway and LRT lines, GO Transit corridors, UP Express, mapped stations, accessibility references, and reliability methodology.",
  path: "/explore",
});

export default function ExplorePage() {
  return <ExploreGuidePage />;
}
