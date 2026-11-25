import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** One neutral surface. A line or corridor tints its header; other sections stay plain. */
export function ReliabilityCard({ tint, icon, title, meta, href, linkLabel, children }: {
  /** The route colour. */
  tint?: string;
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Makes the header a link; `linkLabel` says where it goes. */
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  const heading = (
    <>
      {icon ? <span className="reliability-card-icon">{icon}</span> : null}
      <h4>{title}</h4>
      {meta ? <span className="reliability-card-meta">{meta}</span> : null}
      {href ? (
        <>
          <span className="sr-only">, {linkLabel}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </>
      ) : null}
    </>
  );
  return (
    <section
      className="reliability-card"
      data-tinted={tint ? "true" : undefined}
      style={tint ? { "--reliability-tint": tint } as CSSProperties : undefined}
    >
      {href
        ? <a className="reliability-card-heading" href={href}>{heading}</a>
        : <div className="reliability-card-heading">{heading}</div>}
      <div className="reliability-card-body">{children}</div>
    </section>
  );
}
