import { NextResponse } from "next/server";
import { lineWatchAppVersion, lineWatchAppVersionLabel, lineWatchBuildLabel } from "../app-build";
import { releaseNotePreviewForVersion } from "../release-notes";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export function GET() {
  return NextResponse.json(
    {
      appVersion: lineWatchAppVersion,
      buildLabel: lineWatchBuildLabel,
      releaseNote: releaseNotePreviewForVersion(lineWatchAppVersion),
      versionLabel: lineWatchAppVersionLabel,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: noStoreHeaders,
    },
  );
}
