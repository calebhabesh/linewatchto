import type { MetadataRoute } from "next";
import { getLineWatchAppTitle } from "./app-title.ts";

export default function manifest(): MetadataRoute.Manifest {
  const appTitle = getLineWatchAppTitle();

  return {
    id: "/",
    name: appTitle,
    short_name: "LineWatch",
    description: "Unofficial TTC reliability dashboard for Toronto subway and LRT riders.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0808",
    theme_color: "#0d0808",
    lang: "en-CA",
    categories: ["navigation", "travel", "utilities"],
    prefer_related_applications: false,
    related_applications: [
      {
        platform: "webapp",
        url: "/manifest.webmanifest",
        id: "/",
      },
    ],
    icons: [
      {
        src: "/assets/linewatch/pwa/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/linewatch/pwa/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/linewatch/pwa/maskable-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
