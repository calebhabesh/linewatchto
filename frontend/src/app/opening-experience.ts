import type { ReleaseNote } from "./release-notes.ts";
import { shouldShowReleaseNotesNotice } from "./release-notes.ts";

export type OpeningExperience = "welcome" | "release-notes" | null;

export function chooseOpeningExperience({
  welcomeSeen,
  releaseNote,
  seenReleaseVersion,
}: {
  welcomeSeen: boolean;
  releaseNote: ReleaseNote | null | undefined;
  seenReleaseVersion: string | null | undefined;
}): OpeningExperience {
  if (!welcomeSeen) {
    return "welcome";
  }

  return shouldShowReleaseNotesNotice(releaseNote, seenReleaseVersion)
    ? "release-notes"
    : null;
}
