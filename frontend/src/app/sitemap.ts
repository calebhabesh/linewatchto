import { buildLineWatchSitemap } from "./seo";
import { transitGuideSitemapPages } from "./transit-guide-data";

export default function sitemap() {
  return buildLineWatchSitemap(undefined, transitGuideSitemapPages());
}
