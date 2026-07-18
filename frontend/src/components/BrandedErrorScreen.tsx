import Link from "next/link";
import Image from "next/image";

type BrandedErrorScreenProps = {
  eyebrow: string;
  title: string;
  message: string;
  primaryActionLabel?: string;
  primaryActionHref?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
};

export function BrandedErrorScreen({
  eyebrow,
  title,
  message,
  primaryActionLabel = "Return to dashboard",
  primaryActionHref = "/",
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionHref,
}: BrandedErrorScreenProps) {
  return (
    <main className="linewatch-error-screen">
      <section className="linewatch-error-card" aria-labelledby="linewatch-error-title">
        <div className="linewatch-transit-accent-strip linewatch-error-strip" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="linewatch-error-card-body">
          <div className="linewatch-error-brand">
            <Image src="/assets/linewatch/logo.svg" alt="" width={44} height={44} />
            <span>LineWatchTO</span>
          </div>
          <p className="linewatch-error-eyebrow">{eyebrow}</p>
          <h1 id="linewatch-error-title">{title}</h1>
          <p className="linewatch-error-message">{message}</p>
          <div className="linewatch-error-actions">
            {onPrimaryAction ? (
              <button type="button" onClick={onPrimaryAction}>
                {primaryActionLabel}
              </button>
            ) : (
              <Link href={primaryActionHref}>{primaryActionLabel}</Link>
            )}
            {secondaryActionLabel && secondaryActionHref ? (
              <Link className="linewatch-error-secondary-action" href={secondaryActionHref}>
                {secondaryActionLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
