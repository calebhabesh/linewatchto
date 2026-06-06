import { LineWatchShell } from "../../components/LineWatchShell";
import { loadDashboardInitialData } from "../dashboard-data";

type ResetPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export function decodeResetTokenParam(value: string | string[] | undefined) {
  const token = Array.isArray(value) ? value[0] : value;
  return token?.trim() ?? "";
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const initialData = await loadDashboardInitialData();

  return (
    <LineWatchShell
      initialData={initialData}
      initialPasswordResetToken={decodeResetTokenParam(params.token)}
    />
  );
}
