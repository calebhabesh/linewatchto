import type { Metadata } from "next";
import { BrandedErrorScreen } from "../components/BrandedErrorScreen";
import { lineWatchAppTitle } from "./app-title";

export const metadata: Metadata = {
  title: `Page not in service | ${lineWatchAppTitle}`,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <BrandedErrorScreen
      eyebrow="404"
      title="Page not in service"
      message="This LineWatchTO page is not part of the current dashboard. Return to the map-first view for current service panels, station details, and commute impact checks."
      primaryActionLabel="Return to Dashboard"
      primaryActionHref="/"
    />
  );
}
