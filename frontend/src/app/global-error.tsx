"use client";

import { useEffect } from "react";
import { BrandedErrorScreen } from "../components/BrandedErrorScreen";
import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error }: GlobalErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <BrandedErrorScreen
          eyebrow="App shell error"
          title="LineWatchTO needs a refresh"
          message="The app shell could not recover this view. Refresh the dashboard to load a clean session."
          primaryActionLabel="Refresh Dashboard"
          onPrimaryAction={() => window.location.assign("/")}
          secondaryActionLabel="Open Dashboard"
          secondaryActionHref="/"
        />
      </body>
    </html>
  );
}
