import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildTransitGuideMetadata } from "../../../../seo";
import { findTransitGuideRoute, ttcGuideRoutes } from "../../../../transit-guide-data";
import { RouteGuidePage } from "../../../transit-guide-components";

type PageProps = { params: Promise<{ lineSlug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return ttcGuideRoutes.map((route) => ({ lineSlug: route.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lineSlug } = await params;
  const route = findTransitGuideRoute("ttc", lineSlug);
  if (!route) return {};
  return buildTransitGuideMetadata({
    title: `TTC Line ${route.number} ${route.name}: Stations & Status`,
    description: `${route.description} Browse mapped stations and open the LineWatchTO dashboard for source-labeled current conditions.`,
    path: `/ttc/lines/${route.slug}`,
  });
}

export default async function TtcLinePage({ params }: PageProps) {
  const { lineSlug } = await params;
  const route = findTransitGuideRoute("ttc", lineSlug);
  if (!route) notFound();
  return <RouteGuidePage route={route} />;
}
