import type { Metadata } from "next";
import { buildTransitGuideMetadata } from "../../seo";
import { LegalNoticePage } from "../transit-guide-components";

export const metadata: Metadata = buildTransitGuideMetadata({
  title: "Terms of Use",
  description: "The terms for using LineWatchTO, an unofficial and independent Toronto transit dashboard.",
  path: "/terms",
});

export default function TermsPage() {
  return <LegalNoticePage notice="terms" />;
}
