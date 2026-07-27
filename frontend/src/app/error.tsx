"use client";

import { useEffect } from "react";
import { BrandedErrorScreen } from "../components/BrandedErrorScreen";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <BrandedErrorScreen
      eyebrow="Dashboard error"
      title="Something interrupted the dashboard"
      message="The current view could not finish loading. Try again, or return to the main LineWatchTO dashboard."
      primaryActionLabel="Try again"
      onPrimaryAction={() => reset()}
      secondaryActionLabel="Return to Dashboard"
      secondaryActionHref="/"
    />
  );
}
