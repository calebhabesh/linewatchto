"use client";

import { Sparkles } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { lineWatchAppVersionLabel } from "../app/app-build";
import { currentReleaseNote, releaseNotes } from "../app/release-notes";

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
        <div className="release-notes-current">
          <span>Installed</span>
          <strong>{lineWatchAppVersionLabel}</strong>
          <p>{currentReleaseNote?.summary ?? "Release notes are not available for this installed version."}</p>
        </div>

        <div className="release-notes-list" aria-label="LineWatchTO release history">
          {releaseNotes.map((note) => (
            <article key={note.version} className="release-note-card">
              <div className="release-note-card-heading">
                <div>
                  <span className="release-note-version">v{note.version}</span>
                  <h3>{note.title}</h3>
                </div>
                <time dateTime={note.releasedAt}>{note.releasedAt}</time>
              </div>
              <p className="release-note-summary">{note.summary}</p>
              <div className="release-note-sections">
                {note.sections.map((section) => (
                  <section key={`${note.version}-${section.title}`}>
                    <h4>{section.title}</h4>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
