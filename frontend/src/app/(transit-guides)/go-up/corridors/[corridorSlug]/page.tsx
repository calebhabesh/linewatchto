import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildTransitGuideMetadata } from "../../../../seo";
import { findTransitGuideRoute, regionalGuideRoutes } from "../../../../transit-guide-data";
import { RouteGuidePage } from "../../../transit-guide-components";

type PageProps = { params: Promise<{ corridorSlug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return regionalGuideRoutes.map((route) => ({ corridorSlug: route.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { corridorSlug } = await params;
  const route = findTransitGuideRoute("go-up", corridorSlug);
  if (!route) return {};
  return buildTransitGuideMetadata({
    title: `${route.name} ${route.number}: Stations & Service Guide`,
    description: `${route.description} Browse mapped stations and open LineWatchTO for freshness-gated, source-labeled regional information.`,
    path: `/go-up/corridors/${route.slug}`,
  });
}

export default async function RegionalCorridorPage({ params }: PageProps) {
  const { corridorSlug } = await params;
  const route = findTransitGuideRoute("go-up", corridorSlug);
  if (!route) notFound();
  return <RouteGuidePage route={route} />;
}
