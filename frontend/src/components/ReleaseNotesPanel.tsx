"use client";

import { ChevronLeft, Sparkles, X } from "lucide-react";
import { lineWatchAppVersionLabel } from "../app/app-build";
import { currentReleaseNote, releaseNotes } from "../app/release-notes";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export function ReleaseNotesPanel({ onBack, onClose }: Props) {
  return (
    <section className="release-notes-panel panel" aria-label="Release notes">
      <div className="panel-heading @container border-b border-black/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0 dark:border-white/10">
        <div className="flex items-center gap-1 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-3 mr-1 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0 dark:hover:bg-white/10"
              aria-label="Back to menu"
            >
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          ) : null}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 flex items-center gap-1 sm:gap-2 whitespace-nowrap dark:text-white">
            <Sparkles className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-amber-500 shrink-0" aria-hidden="true" />
            <span>{"What's New"}</span>
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center dark:hover:bg-white/10"
            aria-label="Close release notes"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        ) : null}
      </div>

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
