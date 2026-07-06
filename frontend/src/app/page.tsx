import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LineWatchDevBootstrap } from "../components/LineWatchDevBootstrap";
import { loadDashboardInitialData } from "./dashboard-data";
import { lineWatchSeoTitle } from "./seo";
import {
  initialVisualPreferencesFromCookie,
  VISUAL_PREFERENCES_COOKIE_NAME,
} from "./visual-preferences";

export const metadata: Metadata = {
  title: lineWatchSeoTitle,
};

export default async function Home() {
  const initialData = await loadDashboardInitialData();
  const cookieStore = await cookies();
  const initialVisualPreferences = initialVisualPreferencesFromCookie(
    cookieStore.get(VISUAL_PREFERENCES_COOKIE_NAME)?.value,
  );

  return (
    <LineWatchDevBootstrap
      initialData={initialData}
      initialVisualPreferences={initialVisualPreferences}
    />
  );
}
