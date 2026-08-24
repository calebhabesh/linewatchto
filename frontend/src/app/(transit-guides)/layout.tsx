/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide shell free of client router code */
import { ArrowRight, Map } from "lucide-react";
import Image from "next/image";
import styles from "./transit-guide.module.css";

export default function TransitGuideLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/" aria-label="LineWatchTO interactive dashboard">
            <Image src="/assets/linewatch/logo.svg" alt="" width={36} height={36} className={styles.brandLogo} />
            <span className={styles.brandWordmark}>LineWatchTO</span>
          </a>
          <nav className={styles.nav} aria-label="Transit information">
            <a href="/explore">Explore</a>
            <a href="/ttc">TTC</a>
            <a href="/go-up">GO &amp; UP</a>
            <a href="/ttc/reliability">Reliability</a>
          </nav>
          <a className={styles.headerDashboardBtn} href="/" aria-label="Open LineWatchTO interactive live map">
            <Map size={16} aria-hidden="true" className={styles.headerDashboardBtnIcon} />
            <span>View Live Map</span>
            <ArrowRight size={14} aria-hidden="true" className={styles.headerDashboardBtnArrow} />
          </a>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <p><strong>LineWatchTO</strong> is an independent, unofficial transit reliability dashboard for Toronto rapid transit and regional rail.</p>
            <p>Confirm time-sensitive travel information directly with <a href="https://www.ttc.ca/" rel="noreferrer">TTC</a> or <a href="https://www.gotransit.com/" rel="noreferrer">GO Transit</a>.</p>
          </div>
          <div>
            <p><a href="/">Interactive Dashboard</a> · <a href="/explore">Transit Guide</a> · <a href="/ttc/reliability">Reliability Methodology</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
