import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { PwaServiceWorkerRegistration } from "../components/PwaServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  applicationName: "LineWatch TO",
  title: {
    default: "LineWatch TO",
    template: "%s | LineWatch TO",
  },
  description: "Unofficial TTC reliability dashboard for Toronto subway and LRT riders.",
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
    title: "LineWatch TO",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
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
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning>
        <PwaServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
