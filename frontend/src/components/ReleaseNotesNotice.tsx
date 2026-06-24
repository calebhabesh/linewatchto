"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  RELEASE_NOTES_SEEN_STORAGE_KEY,
  currentReleaseNote,
  shouldShowReleaseNotesNotice,
} from "../app/release-notes";

type Props = {
  blocked: boolean;
  onViewReleaseNotes: () => void;
};

export function ReleaseNotesNotice({ blocked, onViewReleaseNotes }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!currentReleaseNote) {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        setVisible(shouldShowReleaseNotesNotice(currentReleaseNote, window.localStorage.getItem(RELEASE_NOTES_SEEN_STORAGE_KEY)));
      } catch {
        setVisible(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const markSeen = () => {
    if (!currentReleaseNote) {
      return;
    }

    try {
      window.localStorage.setItem(RELEASE_NOTES_SEEN_STORAGE_KEY, currentReleaseNote.version);
    } catch {
      // The notice is only a convenience; storage failures should not interrupt the dashboard.
    }
    setVisible(false);
  };

  if (!currentReleaseNote || !visible || blocked) {
    return null;
  }

  return (
    <aside className="release-notes-notice" role="status" aria-live="polite">
      <div className="release-notes-notice-icon" aria-hidden="true">
        <Sparkles size={17} />
      </div>
      <div className="release-notes-notice-copy">
        <strong>{`What's new in v${currentReleaseNote.version}`}</strong>
        <span>{currentReleaseNote.summary}</span>
      </div>
      <div className="release-notes-notice-actions">
        <button
          type="button"
          onClick={() => {
            markSeen();
            onViewReleaseNotes();
          }}
        >
          View changes
        </button>
        <button type="button" className="release-notes-notice-dismiss" onClick={markSeen} aria-label="Dismiss release notes notice">
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}
