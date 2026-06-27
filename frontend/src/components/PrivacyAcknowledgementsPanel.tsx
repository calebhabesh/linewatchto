"use client";

import { ChevronLeft, ExternalLink, FileText, ShieldCheck, X } from "lucide-react";
import {
  acknowledgementSections,
  dataPracticeSections,
  privacyAcknowledgementLinks,
  type NoticeSection,
} from "../app/privacy-acknowledgements-data";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

function NoticeSectionList({ sections }: { sections: NoticeSection[] }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <article
          key={section.title}
          className="rounded-lg border border-black/10 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
        >
          <h3 className="text-sm font-bold text-slate-950 dark:text-white">{section.title}</h3>
          <p className="mt-1 leading-relaxed">{section.body}</p>
          {section.bullets?.length ? (
            <ul className="mt-2 space-y-1 pl-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="list-disc">{bullet}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function PrivacyAcknowledgementsPanel({ onBack, onClose }: Props) {
  return (
    <section className="privacy-acknowledgements-panel panel" aria-label="Privacy and acknowledgements">
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
            <FileText className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-blue-500 shrink-0" aria-hidden="true" />
            <span>Privacy & Acknowledgements</span>
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center dark:hover:bg-white/10"
            aria-label="Close privacy and acknowledgements"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        ) : null}
      </div>

      <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 py-4 privacy-acknowledgements-scroll">
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-500/25 bg-blue-50 p-3 text-sm text-slate-800 dark:bg-blue-950 dark:text-slate-100">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
              <p className="leading-relaxed">
                This page is a plain-language notice for riders and reviewers. It is not legal advice, and it does not replace the official TTC or privacy source documents linked below.
              </p>
            </div>
          </div>

          <section aria-labelledby="acknowledgement-heading" className="space-y-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-slate-500 dark:text-slate-400"
                fill="currentColor"
                viewBox="0 0 32 32"
                aria-hidden="true"
              >
                <path d="M18 23l-1-0v-8.938c0-0.011-0.003-0.021-0.003-0.031s0.003-0.020 0.003-0.031c0-0.552-0.448-1-1-1h-2c-0.552 0-1 0.448-1 1s0.448 1 1 1h1v8h-1c-0.552 0-1 0.448-1 1s0.448 1 1 1h4c0.552 0 1-0.448 1-1s-0.448-1-1-1zM16 11c1.105 0 2-0.896 2-2s-0.895-2-2-2-2 0.896-2 2 0.896 2 2 2zM16-0c-8.836 0-16 7.163-16 16s7.163 16 16 16c8.837 0 16-7.163 16-16s-7.163-16-16-16zM16 30.031c-7.72 0-14-6.312-14-14.032s6.28-14 14-14 14 6.28 14 14-6.28 14.032-14 14.032z" />
              </svg>
              <h3 id="acknowledgement-heading" className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Acknowledgements
              </h3>
            </div>
            <NoticeSectionList sections={acknowledgementSections} />
          </section>

          <section aria-labelledby="privacy-heading" className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <h3 id="privacy-heading" className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Privacy Notice
              </h3>
            </div>
            <NoticeSectionList sections={dataPracticeSections} />
          </section>

          <section aria-labelledby="source-links-heading" className="space-y-3">
            <h3 id="source-links-heading" className="text-sm font-bold text-slate-500 dark:text-slate-400">
              Source Links
            </h3>
            <div className="space-y-2">
              {privacyAcknowledgementLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-black/10 bg-white p-3 text-sm text-slate-700 transition hover:border-blue-500/40 hover:bg-blue-500/10 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                >
                  <span className="flex items-center justify-between gap-3 font-bold text-slate-950 dark:text-white">
                    {link.label}
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">{link.description}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
