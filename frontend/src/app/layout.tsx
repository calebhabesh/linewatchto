import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineWatch TO",
  description: "Unofficial TTC reliability dashboard for Toronto subway and LRT riders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
