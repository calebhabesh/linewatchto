"use client";

import { ExternalLink, FileText, Info, ShieldCheck } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
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
      <PanelHeader
        title="Privacy & Acknowledgements"
        titleCompact
        icon={<FileText className="w-5 h-5 text-blue-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        backLabel="Back to menu"
        onClose={onClose}
        closeLabel="Close privacy and acknowledgements"
      />

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
