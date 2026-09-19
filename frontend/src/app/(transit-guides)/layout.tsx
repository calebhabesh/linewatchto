/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide shell free of client router code */
import { ArrowRight, ExternalLink, Map, ShieldAlert } from "lucide-react";
import Image from "next/image";
import { GuideNav } from "./transit-guide-interactive";
import styles from "./transit-guide.module.css";

export default function TransitGuideLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${styles.site} linewatch-shell dark`} data-guide-shell>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var s=document.currentScript.parentElement,t=localStorage.getItem("linewatch-theme-v1"),h=localStorage.getItem("linewatch-high-contrast-enabled-v1")==="true",m=localStorage.getItem("linewatch-reduced-motion-enabled-v1")==="true";s.classList.toggle("dark",t!=="light"||h);s.classList.toggle("high-contrast",h);s.classList.toggle("motion-paused",m)}catch(e){}})();`,
        }}
      />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/" aria-label="LineWatchTO interactive dashboard">
            <Image src="/assets/linewatch/logo.svg" alt="" width={34} height={34} className={styles.brandLogo} />
            <span className={styles.brandWordmark}>LineWatchTO</span>
          </a>
          <GuideNav />
          <a className={styles.headerDashboardBtn} href="/" aria-label="Open LineWatchTO map">
            <Map size={16} aria-hidden="true" className={styles.headerDashboardBtnIcon} />
            <span>Open map</span>
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
              <span className={styles.footerTagBadge}>Unofficial transit dashboard</span>
            </div>
            <p className={styles.footerDescription}>
              Independent guides to the rapid-transit and regional rail routes represented in LineWatchTO. Current conditions remain source- and freshness-labeled in the dashboard.
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
            <span className={styles.footerNavHeader}>Guides and resources</span>
            <ul className={styles.footerNavList}>
              <li>
                <a href="/" className={styles.footerNavLink}>
                  <span>Current status map</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/explore" className={styles.footerNavLink}>
                  <span>Explore transit guides</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/ttc" className={styles.footerNavLink}>
                  <span>TTC subway and LRT</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/go-up" className={styles.footerNavLink}>
                  <span>GO and UP regional rail</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/ttc/reliability" className={styles.footerNavLink}>
                  <span>TTC reliability methodology</span>
                  <ArrowRight size={12} className={styles.footerNavArrow} aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottomBar}>
          <div className={styles.footerBottomInner}>
            <span>Times are shown in Toronto local time.</span>
            <span>Static guides do not guarantee current service.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
