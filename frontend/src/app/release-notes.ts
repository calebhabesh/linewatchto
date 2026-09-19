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
  announceOnLaunch: boolean;
  sections: ReleaseNoteSection[];
};

export type ReleaseNotePreview = Pick<ReleaseNote, "version" | "title" | "summary" | "sections">;

export const RELEASE_NOTES_SEEN_STORAGE_KEY = "linewatch-seen-release-notes-version";

export const releaseNotes: ReleaseNote[] = [
  {
    version: "1.1.0",
    releasedAt: "2026-09-19",
    title: "A new way to explore",
    summary: "A new geographic Map view and redesigned desktop sidebar make service easier to explore across TTC and GO/UP.",
    announceOnLaunch: true,
    sections: [
      {
        title: "Highlights",
        items: [
          "Switch between the familiar Diagram and the new geographic Map view.",
          "Use the redesigned desktop sidebar to search, check current service, and open My Stations or My Commutes without leaving the map.",
          "Navigate clearer map controls, disruption overlays, and responsive layouts across desktop and mobile.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    releasedAt: "2026-06-24",
    title: "The first LineWatchTO release",
    summary: "A map-first dashboard for checking TTC and GO/UP service and keeping everyday trips close at hand.",
    announceOnLaunch: false,
    sections: [
      {
        title: "Highlights",
        items: [
          "Follow source-linked service alerts, planned closures, accessibility outages, and station arrivals.",
          "Save favourite stops in My Stations and monitor regular trips with My Commutes.",
          "Search across TTC and GO/UP, review reliability, and opt in to commute or line notifications.",
        ],
      },
    ],
  },
];

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
  if (!note?.announceOnLaunch) {
    return false;
  }

  return seenVersion?.trim() !== note.version;
}
