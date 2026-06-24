import { lineWatchAppVersion } from "./app-build.ts";

export type ReleaseNoteSection = {
  title: string;
  items: string[];
};

export type ReleaseNote = {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  sections: ReleaseNoteSection[];
};

export type ReleaseNotePreview = Pick<ReleaseNote, "version" | "title" | "summary" | "sections">;

export const RELEASE_NOTES_SEEN_STORAGE_KEY = "linewatch-seen-release-notes-version";

export const releaseNotes: ReleaseNote[] = [
  {
    version: "1.0.0",
    releasedAt: "2026-06-24",
    title: "LineWatchTO 1.0.0",
    summary: "Initial release candidate with account polish, update handling, and the core TTC dashboard experience.",
    sections: [
      {
        title: "Added",
        items: [
          "Map-first subway and LRT dashboard with alert, delay, Reduced Speed Zone, closure, accessibility, and surface-notice views.",
          "Account-backed saved commutes, optional return trips, Google sign-in linking, and Web Push preference surfaces.",
          "Installable PWA shell with explicit update handling, app version labels, and staging/prod build labels.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Google sign-in now explains when an existing email/password account needs to sign in first and link Google from Account.",
          "App update checks now compare the app version and build label so staging and production deploys are easier to verify.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Staging and production builds now derive the public app version from the frontend package version.",
          "Build labels remain commit-based, so small fixes can deploy without changing the public app version.",
        ],
      },
    ],
  },
];

export const latestReleaseNote = releaseNotes[0];

export function releaseNoteForVersion(version: string | null | undefined) {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) {
    return null;
  }

  return releaseNotes.find((note) => note.version === normalizedVersion) ?? null;
}

export const currentReleaseNote = releaseNoteForVersion(lineWatchAppVersion);

export function releaseNotePreviewForVersion(version: string | null | undefined): ReleaseNotePreview | null {
  const note = releaseNoteForVersion(version);
  if (!note) {
    return null;
  }

  return {
    version: note.version,
    title: note.title,
    summary: note.summary,
    sections: note.sections,
  };
}

export function shouldShowReleaseNotesNotice(note: ReleaseNote | null | undefined, seenVersion: string | null | undefined) {
  if (!note) {
    return false;
  }

  return seenVersion?.trim() !== note.version;
}
