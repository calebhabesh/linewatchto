const fallbackVersion = "0.1.0";
const fallbackBuildLabel = process.env.NODE_ENV === "production" ? "local" : "dev";

export const lineWatchAppVersion = process.env.NEXT_PUBLIC_LINEWATCH_APP_VERSION || fallbackVersion;
export const lineWatchBuildLabel = process.env.NEXT_PUBLIC_LINEWATCH_BUILD_LABEL || fallbackBuildLabel;
export const lineWatchAppVersionLabel = `v${lineWatchAppVersion} · ${lineWatchBuildLabel}`;
