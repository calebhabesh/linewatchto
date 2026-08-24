import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildTransitGuideMetadata } from "../../../../seo";
import { findTransitGuideStation, regionalGuideStations } from "../../../../transit-guide-data";
import { StationGuidePage } from "../../../transit-guide-components";

type PageProps = { params: Promise<{ stationSlug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return regionalGuideStations.map((station) => ({ stationSlug: station.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stationSlug } = await params;
  const station = findTransitGuideStation("go-up", stationSlug);
  if (!station) return {};
  const routeNames = station.routes.map((route) => route.name).join(", ");
  return buildTransitGuideMetadata({
    title: `${station.name} GO/UP Station: Routes & Accessibility`,
    description: `Guide to ${station.name} on ${routeNames || "the GO/UP rail network"}, with mapped routes and accessibility references. Check current details in LineWatchTO.`,
    path: `/go-up/stations/${station.slug}`,
  });
}

export default async function RegionalStationPage({ params }: PageProps) {
  const { stationSlug } = await params;
  const station = findTransitGuideStation("go-up", stationSlug);
  if (!station) notFound();
  return <StationGuidePage station={station} />;
}
