"use client";

import { Sparkles } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { lineWatchAppVersion } from "../app/app-build";
import { releaseNotes } from "../app/release-notes";
import { ReleaseNoteCard } from "./ReleaseNoteCard";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export function ReleaseNotesPanel({ onBack, onClose }: Props) {
  return (
    <section className="release-notes-panel panel" aria-label="Release notes">
      <PanelHeader
        title="What's New"
        icon={<Sparkles className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        backLabel="Back to menu"
        onClose={onClose}
        closeLabel="Close release notes"
      />

      <div className="release-notes-content">
        <div className="release-notes-list" aria-label="LineWatchTO release history">
          {releaseNotes.map((note) => (
            <ReleaseNoteCard key={note.version} note={note} current={note.version === lineWatchAppVersion} />
          ))}
        </div>
      </div>
    </section>
  );
}
