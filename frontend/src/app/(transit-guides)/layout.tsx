/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide shell free of client router code */
import { ArrowRight, ExternalLink, Map, ShieldAlert } from "lucide-react";
import Image from "next/image";
import styles from "./transit-guide.module.css";

export default function TransitGuideLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/" aria-label="LineWatchTO interactive dashboard">
            <Image src="/assets/linewatch/logo.svg" alt="" width={34} height={34} className={styles.brandLogo} />
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
          <div className={styles.footerBrandCol}>
            <div className={styles.footerBrandHeader}>
              <Image src="/assets/linewatch/logo.svg" alt="" width={24} height={24} className={styles.footerBrandLogo} />
              <span className={styles.footerBrandWordmark}>LineWatchTO</span>
              <span className={styles.footerTagBadge}>Unofficial Dashboard</span>
            </div>
            <p className={styles.footerDescription}>
              An independent, portfolio-grade transit reliability dashboard for Toronto rapid transit (TTC Lines 1, 2, 4, 5, 6) and Metrolinx regional rail (GO Transit &amp; UP Express).
            </p>
            <div className={styles.footerAdvisory}>
              <ShieldAlert size={14} className={styles.footerAdvisoryIcon} aria-hidden="true" />
              <span>
                Confirm time-sensitive travel information directly with official agency feeds:{" "}
                <a href="https://www.ttc.ca/" target="_blank" rel="noreferrer" className={styles.footerAgencyLink}>
                  TTC.ca <ExternalLink size={11} aria-hidden="true" />
                </a>{" "}
                or{" "}
                <a href="https://www.gotransit.com/" target="_blank" rel="noreferrer" className={styles.footerAgencyLink}>
                  GOTransit.com <ExternalLink size={11} aria-hidden="true" />
                </a>.
              </span>
            </div>
          </div>
          <div className={styles.footerNavCol}>
            <span className={styles.footerNavHeader}>Wayfinding &amp; Resources</span>
            <ul className={styles.footerNavList}>
              <li>
                <a href="/" className={styles.footerNavLink}>
                  <span>Interactive Live Map</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/explore" className={styles.footerNavLink}>
                  <span>Explore Network Guide</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/ttc" className={styles.footerNavLink}>
                  <span>TTC Subway &amp; LRT</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/go-up" className={styles.footerNavLink}>
                  <span>GO &amp; UP Regional Rail</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/ttc/reliability" className={styles.footerNavLink}>
                  <span>Reliability Methodology</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottomBar}>
          <div className={styles.footerBottomInner}>
            <span>All schedule and advisory times displayed in Eastern Time (Toronto).</span>
            <span>Derivative replicas of referenced transit maps for wayfinding optimization.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
