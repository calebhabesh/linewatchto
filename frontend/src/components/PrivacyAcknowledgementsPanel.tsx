"use client";

import { ChevronLeft, ExternalLink, FileText, Info, ShieldCheck, X } from "lucide-react";
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
    <div className="space-y-6">
      {sections.map((section) => (
        <article
          key={section.title}
          className="text-sm text-slate-700 dark:text-slate-200"
        >
          <h4 className="font-bold text-slate-900 dark:text-white">{section.title}</h4>
          <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">{section.body}</p>
          {section.bullets?.length ? (
            <ul className="mt-1.5 space-y-1.5 pl-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
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
              className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center dark:hover:bg-white/10"
              aria-label="Back to menu"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
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
            className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center dark:hover:bg-white/10"
            aria-label="Close privacy and acknowledgements"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        ) : null}
      </div>

      <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 py-4 privacy-acknowledgements-scroll">
        <div className="space-y-5">
          <div className="border-l-2 border-blue-500 pl-3 text-sm">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
              <p className="leading-relaxed text-slate-600 dark:text-slate-400">
                This page is a plain-language notice for riders and reviewers. It is not legal advice, and it does not replace the official TTC or privacy source documents linked below.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <section aria-labelledby="acknowledgement-heading" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-black/10 pb-2 dark:border-white/10">
                <Info className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <h3 id="acknowledgement-heading" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Acknowledgements
                </h3>
              </div>
              <NoticeSectionList sections={acknowledgementSections} />
            </section>

            <section aria-labelledby="privacy-heading" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-black/10 pb-2 dark:border-white/10">
                <ShieldCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <h3 id="privacy-heading" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Privacy Notice
                </h3>
              </div>
              <NoticeSectionList sections={dataPracticeSections} />
            </section>

            <section aria-labelledby="source-links-heading" className="space-y-4">
              <div className="border-b border-black/10 pb-2 dark:border-white/10">
                <h3 id="source-links-heading" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Source Links
                </h3>
              </div>
              <div className="space-y-5">
                {privacyAcknowledgementLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group block text-sm"
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-950 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      {link.label}
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400" aria-hidden="true" />
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {link.description}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
