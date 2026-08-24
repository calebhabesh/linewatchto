import type { Metadata } from "next";
import { LineWatchShell } from "../../components/LineWatchShell";
import { lineWatchAppTitle } from "../app-title";
import { loadDashboardInitialData } from "../dashboard-data";

type VerifyEmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export function decodeEmailVerificationTokenParam(value: string | string[] | undefined) {
  const token = Array.isArray(value) ? value[0] : value;
  return token?.trim() ?? "";
}

export const metadata: Metadata = {
  title: `Verify email | ${lineWatchAppTitle}`,
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const initialData = await loadDashboardInitialData();

  return (
    <LineWatchShell
      initialData={initialData}
      initialEmailVerificationToken={decodeEmailVerificationTokenParam(params.token)}
    />
  );
}
