"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  Info,
  Megaphone,
  Search,
  X,
} from "lucide-react";
import {
  getTtcAnnouncements,
  type TtcAnnouncementResponse,
} from "../app/announcement-data";
import { formatImpactTimestamp, formatOperationalDateTime } from "../app/impact-time";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function TtcAnnouncementsPanel({ onBack, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TtcAnnouncementResponse | null>(null);
  const loading = data === null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAnnouncements = useMemo(() => {
    if (!data || !normalizedQuery) return data?.announcements ?? [];
    return data.announcements.filter((announcement) =>
      [announcement.title, announcement.description, announcement.scope, announcement.source]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [data, normalizedQuery]);

  useEffect(() => {
    let active = true;
    void getTtcAnnouncements().then((result) => {
      if (!active) return;
      setData(result.data);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="panel min-w-0 border border-transparent rounded-2xl flex h-full flex-col bg-white dark:bg-[#0a0c10]" aria-label="TTC announcements">
      <div className="panel-heading border-b border-black/5 dark:border-white/5 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2 min-w-0 shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={onBack} className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Back">
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="flex items-center gap-2 whitespace-nowrap text-[clamp(14px,4.5cqw,18px)] font-bold text-slate-900 dark:text-white">
            <Megaphone className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            TTC Announcements
          </h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Close">
          <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
        </button>
      </div>

      <div className="notification-settings-scroll flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mb-2.5 flex flex-col gap-2.5">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Official TTC updates and active system messages. Informational only.</span>
          </p>

          <label className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-100 px-3 py-2 dark:border-transparent dark:bg-white/5">
            <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="sr-only">Search TTC announcements</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search announcements"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"
            />
          </label>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading TTC announcements…</p>
        ) : !data?.fresh ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            Neither a fresh TTC Live Alerts run nor the official TTC.ca Updates listing is currently available.
          </div>
        ) : visibleAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-transparent bg-slate-50 p-3.5 text-sm text-slate-600 dark:border-transparent dark:bg-white/5 dark:text-slate-300">
            {normalizedQuery ? "No TTC announcements match this search." : "TTC is not publishing any active system messages or Updates entries right now."}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visibleAnnouncements.map((announcement) => {
              const externalUrl = safeExternalUrl(announcement.url);
              return (
                <article key={announcement.id} className="rounded-xl border border-transparent bg-slate-50 p-3 dark:border-transparent dark:bg-[#12151c] shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">
                      {announcement.scope === "site-wide" ? "System-wide" : announcement.scope === "update" ? "TTC Update" : "General"}
                    </span>
                    {announcement.updatedAt ? (
                      <span className="shrink-0 text-[10px] font-semibold text-slate-500" title={formatOperationalDateTime(announcement.updatedAt)}>
                        Updated {formatImpactTimestamp(announcement.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-sm font-black leading-snug text-slate-900 dark:text-white">{announcement.title}</h3>
                  {announcement.description ? <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">{announcement.description}</p> : null}
                  {announcement.startAt ? (
                    <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Active {formatOperationalDateTime(announcement.startAt)}{announcement.endAt ? ` to ${formatOperationalDateTime(announcement.endAt)}` : ""}
                    </p>
                  ) : null}
                  {externalUrl ? (
                    <a href={externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline dark:text-sky-300">
                      View on TTC.ca <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {data?.fresh ? <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Source: {data.source}</p> : null}
      </div>
    </section>
  );
}
