/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide shell free of client router code */
import Image from "next/image";
import styles from "./transit-guide.module.css";

export default function TransitGuideLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/" aria-label="LineWatchTO interactive dashboard">
            <Image src="/assets/linewatch/logo.svg" alt="" width={30} height={30} />
            <span>LineWatchTO</span>
          </a>
          <nav className={styles.nav} aria-label="Transit information">
            <a href="/explore">Explore</a>
            <a href="/ttc">TTC</a>
            <a href="/go-up">GO &amp; UP</a>
            <a href="/ttc/reliability">Reliability</a>
          </nav>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>LineWatchTO is an independent, unofficial transit dashboard.</p>
          <p>Confirm time-sensitive travel information with TTC or GO Transit.</p>
        </div>
      </footer>
    </div>
  );
}
