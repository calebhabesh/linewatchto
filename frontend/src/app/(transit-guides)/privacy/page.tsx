import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../seo";
import { LegalNoticePage } from "../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "Privacy Policy",
  description: "How LineWatchTO handles account, Sign in with Google, saved commute, push notification, and browser data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <LegalNoticePage notice="privacy" />;
}
