import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Ethiopic } from "next/font/google";
import Script from "next/script";
import { AppUpdateBanner } from "../components/AppUpdateBanner";
import { PwaServiceWorkerRegistration } from "../components/PwaServiceWorkerRegistration";
import { lineWatchAppTitle } from "./app-title.ts";
import {
  getLineWatchSiteOrigin,
  getLineWatchSiteVerification,
  lineWatchSeoDescription,
  lineWatchSeoImagePath,
  lineWatchSeoTitle,
} from "./seo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-wordmark-family",
});

export const metadata: Metadata = {
  metadataBase: getLineWatchSiteOrigin(),
  applicationName: lineWatchAppTitle,
  title: {
    default: lineWatchAppTitle,
    template: `%s | ${lineWatchAppTitle}`,
  },
  description: lineWatchSeoDescription,
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/assets/linewatch/pwa/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/assets/linewatch/pwa/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/assets/linewatch/pwa/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: lineWatchAppTitle,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: lineWatchSeoTitle,
    description: lineWatchSeoDescription,
    url: "/",
    siteName: "LineWatchTO",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: lineWatchSeoImagePath,
        width: 1200,
        height: 630,
        alt: "LineWatchTO dashboard preview map and status",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: lineWatchSeoTitle,
    description: lineWatchSeoDescription,
    images: [lineWatchSeoImagePath],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
  verification: getLineWatchSiteVerification(),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0808" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cfAnalyticsToken = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN;

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${notoSansEthiopic.variable}`}>
      <body suppressHydrationWarning>
        <PwaServiceWorkerRegistration />
        <AppUpdateBanner />
        {children}
        {cfAnalyticsToken && (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfAnalyticsToken })}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
