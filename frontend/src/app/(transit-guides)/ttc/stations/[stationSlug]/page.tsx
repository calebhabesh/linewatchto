import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildTransitGuideMetadata } from "../../../../seo";
import { findTransitGuideStation, ttcGuideStations } from "../../../../transit-guide-data";
import { StationGuidePage } from "../../../transit-guide-components";

type PageProps = { params: Promise<{ stationSlug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return ttcGuideStations.map((station) => ({ stationSlug: station.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stationSlug } = await params;
  const station = findTransitGuideStation("ttc", stationSlug);
  if (!station) return {};
  const lineNames = station.routes.map((route) => `Line ${route.number}`).join(" and ");
  return buildTransitGuideMetadata({
    title: `${station.name} TTC Station: Lines & Accessibility`,
    description: `Guide to ${station.name} on ${lineNames || "the TTC rapid-transit network"}, with mapped connections and accessibility references. Check current details in LineWatchTO.`,
    path: `/ttc/stations/${station.slug}`,
  });
}

export default async function TtcStationPage({ params }: PageProps) {
  const { stationSlug } = await params;
  const station = findTransitGuideStation("ttc", stationSlug);
  if (!station) notFound();
  return <StationGuidePage station={station} />;
}
