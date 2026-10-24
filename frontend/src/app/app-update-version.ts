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
  return `version:${appVersion}`;
}

export function shouldShowAppUpdate(latest: AppUpdateVersion, installed: AppUpdateVersion) {
  const latestAppVersion = cleanVersionPart(latest.appVersion);
  const installedAppVersion = cleanVersionPart(installed.appVersion);

  if (!latestAppVersion || !installedAppVersion) {
    return false;
  }

  return latestAppVersion !== installedAppVersion;
}

// Unversioned local builds share labels across code changes, so they never imply a deploy.
const UNVERSIONED_BUILD_LABELS = new Set(["local", "dev"]);

export const QUIET_UPDATE_WINDOW_MS = 5_000;

// A deploy inside the same app version updates silently instead of prompting.
export function shouldApplyBackgroundUpdate(latest: AppUpdateVersion, installed: AppUpdateVersion) {
  const latestAppVersion = cleanVersionPart(latest.appVersion);
  const latestBuildLabel = cleanVersionPart(latest.buildLabel);
  const installedBuildLabel = cleanVersionPart(installed.buildLabel);

  if (!latestAppVersion || latestAppVersion !== cleanVersionPart(installed.appVersion)) {
    return false;
  }
  if (!latestBuildLabel || !installedBuildLabel) {
    return false;
  }
  if (UNVERSIONED_BUILD_LABELS.has(latestBuildLabel) || UNVERSIONED_BUILD_LABELS.has(installedBuildLabel)) {
    return false;
  }

  return latestBuildLabel !== installedBuildLabel;
}

// Reload only right after a launch or resume, before the person has touched the app.
export function isQuietUpdateMoment({
  now,
  foregroundStartedAt,
  lastInteractionAt,
}: {
  now: number;
  foregroundStartedAt: number;
  lastInteractionAt: number;
}) {
  return now - foregroundStartedAt <= QUIET_UPDATE_WINDOW_MS && lastInteractionAt < foregroundStartedAt;
}

export function appUpdateReleaseNote(latest: AppUpdateVersion, installed: AppUpdateVersion): ReleaseNotePreview | null {
  const latestVersion = appUpdateNewVersion(latest, installed);
  const note = latest.releaseNote;
  return latestVersion && note?.version === latestVersion ? note : null;
}

export function appUpdateNewVersion(latest: AppUpdateVersion, installed: AppUpdateVersion): string | null {
  const latestVersion = cleanVersionPart(latest.appVersion);
  return latestVersion && latestVersion !== cleanVersionPart(installed.appVersion) ? latestVersion : null;
}
