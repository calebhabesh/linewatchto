import type { ReleaseNote } from "../app/release-notes";

export function ReleaseNoteCard({ note, current }: { note: ReleaseNote; current: boolean }) {
  const releaseDate = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${note.releasedAt}T00:00:00Z`));

  return (
    <article className="release-note-card">
      <div className="release-note-card-heading">
        <div>
          <div className="release-note-version-row">
            <span className="release-note-version"><span className="release-note-version-prefix">v</span><span>{note.version}</span></span>
            {current ? <span className="release-note-current-badge">Current</span> : null}
          </div>
          <h3>{note.title}</h3>
        </div>
        <time dateTime={note.releasedAt}>{releaseDate}</time>
      </div>
      <p className="release-note-summary">{note.summary}</p>
      <div className="release-note-sections">
        {note.sections.map((section) => (
          <section key={`${note.version}-${section.title}`}>
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
