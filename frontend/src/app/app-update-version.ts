import type { ReleaseNotePreview } from "./release-notes";

export type AppUpdateVersion = {
  appVersion?: string | null;
  buildLabel?: string | null;
  releaseNote?: ReleaseNotePreview | null;
  versionLabel?: string | null;
};

function cleanVersionPart(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function appUpdateReleaseKey(version: AppUpdateVersion) {
  const appVersion = cleanVersionPart(version.appVersion) || "unknown";
  const buildLabel = cleanVersionPart(version.buildLabel) || "unknown";
  return `version:${appVersion}|build:${buildLabel}`;
}

export function shouldShowAppUpdate(latest: AppUpdateVersion, installed: AppUpdateVersion) {
  const latestAppVersion = cleanVersionPart(latest.appVersion);
  const installedAppVersion = cleanVersionPart(installed.appVersion);
  const latestBuildLabel = cleanVersionPart(latest.buildLabel);
  const installedBuildLabel = cleanVersionPart(installed.buildLabel);

  if (!latestAppVersion && !latestBuildLabel) {
    return false;
  }

  return Boolean(
    (latestAppVersion && installedAppVersion && latestAppVersion !== installedAppVersion)
    || (latestBuildLabel && installedBuildLabel && latestBuildLabel !== installedBuildLabel),
  );
}
