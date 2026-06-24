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

export const releaseNotes: ReleaseNote[] = [];

export const latestReleaseNote = releaseNotes[0] ?? null;
export const hasReleaseNotes = releaseNotes.length > 0;

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
