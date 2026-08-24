/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide pages free of client router code */
import type { CSSProperties, ReactNode } from "react";
import { JsonLd } from "../../components/JsonLd";
import { getLineWatchSiteOrigin } from "../seo";
import {
  adjacentStationsForGuideStation,
  regionalGuideRoutes,
  regionalGuideStations,
  routeGuidePath,
  stationGuidePath,
  stationsForGuideRoute,
  ttcGuideRoutes,
  ttcGuideStations,
  type TransitGuideNetworkSlug,
  type TransitGuideRoute,
  type TransitGuideStation,
} from "../transit-guide-data";
import styles from "./transit-guide.module.css";

type Breadcrumb = { label: string; href?: string };

function absoluteUrl(path: string) {
  return new URL(path, getLineWatchSiteOrigin()).toString();
}

function networkName(networkSlug: TransitGuideNetworkSlug) {
  return networkSlug === "ttc" ? "TTC subway and LRT" : "GO Transit and UP Express";
}

function networkShortName(networkSlug: TransitGuideNetworkSlug) {
  return networkSlug === "ttc" ? "TTC" : "GO & UP";
}

function networkDashboardUrl(networkSlug: TransitGuideNetworkSlug, panel?: string) {
  const params = new URLSearchParams({ network: networkSlug === "ttc" ? "ttc" : "regional" });
  if (panel) params.set("panel", panel);
  return `/?${params.toString()}`;
}

function stationDashboardUrl(station: TransitGuideStation) {
  const params = new URLSearchParams({
    network: station.networkId,
    station: station.id,
  });
  return `/?${params.toString()}`;
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function BreadcrumbJsonLd({ items }: { items: Breadcrumb[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.label,
          item: item.href ? absoluteUrl(item.href) : undefined,
        })),
      }}
    />
  );
}

function RouteBadge({ route }: { route: TransitGuideRoute }) {
  return (
    <span
      className={styles.routeBadge}
      data-text={route.textColor}
      style={{ backgroundColor: route.color } as CSSProperties}
      aria-label={`${route.name} ${route.networkSlug === "ttc" ? `Line ${route.number}` : route.number}`}
    >
      {route.number}
    </span>
  );
}

function PageHero({ eyebrow, title, children, actions }: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <div className={styles.lede}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

function RouteList({ routes }: { routes: TransitGuideRoute[] }) {
  return (
    <ul className={styles.routeList}>
      {routes.map((route) => (
        <li key={route.id}>
          <a className={styles.routeLink} href={routeGuidePath(route)}>
            <RouteBadge route={route} />
            <span>
              <strong>{route.name}</strong>
              <small>{route.routeLabel}</small>
            </span>
            <span className={styles.routeLinkArrow} aria-hidden="true">→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function StationDirectory({ stations }: { stations: TransitGuideStation[] }) {
  return (
    <ul className={styles.directory}>
      {stations.map((station) => (
        <li key={station.id}>
          <a href={stationGuidePath(station)}>{station.name}</a>
        </li>
      ))}
    </ul>
  );
}

function SourceDisclaimer({ networkSlug }: { networkSlug: TransitGuideNetworkSlug }) {
  return (
    <section className={`${styles.section} ${styles.disclaimer}`}>
      <h2>Source and freshness</h2>
      <p>
        <strong>Unofficial:</strong> LineWatchTO is not a TTC or Metrolinx product. Static guide pages explain the mapped network; they are not a current service guarantee. The interactive dashboard identifies source and freshness and only presents supported current information when ingestion is fresh.
      </p>
      <p>
        Check the official {networkSlug === "ttc" ? (
          <a className={styles.link} href="https://www.ttc.ca/" rel="noreferrer">TTC website</a>
        ) : (
          <a className={styles.link} href="https://www.gotransit.com/" rel="noreferrer">GO Transit website</a>
        )} before time-sensitive travel.
      </p>
    </section>
  );
}

export function ExploreGuidePage() {
  const breadcrumbs = [{ label: "Dashboard", href: "/" }, { label: "Explore" }];
  return (
    <main className={styles.main}>
      <Breadcrumbs items={breadcrumbs} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Toronto rapid transit information",
        url: absoluteUrl("/explore"),
        description: "TTC subway and LRT, GO Transit, UP Express, station, corridor, and reliability guides from LineWatchTO.",
      }} />
      <PageHero
        eyebrow="Transit information"
        title="Explore Toronto rapid transit"
        actions={<a className={styles.cta} href="/">Open interactive dashboard</a>}
      >
        Find TTC subway and LRT lines, GO rail corridors, UP Express, mapped stations, accessibility reference information, and LineWatchTO reliability methodology. The dashboard remains the place to check source-labeled current conditions.
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>TTC subway and LRT</h2><a className={styles.link} href="/ttc">All TTC information</a></div>
            <RouteList routes={ttcGuideRoutes} />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>GO Transit and UP Express</h2><a className={styles.link} href="/go-up">All regional information</a></div>
            <RouteList routes={regionalGuideRoutes} />
          </section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2>Reliability guides</h2>
            <ul className={styles.plainList}>
              <li><a className={styles.link} href="/ttc/reliability">How TTC reliability is measured</a></li>
              <li><a className={styles.link} href="/go-up/reliability">How GO/UP reliability is measured</a></li>
            </ul>
          </section>
          <SourceDisclaimer networkSlug="ttc" />
        </aside>
      </div>
    </main>
  );
}

export function NetworkGuidePage({ networkSlug }: { networkSlug: TransitGuideNetworkSlug }) {
  const ttc = networkSlug === "ttc";
  const routes = ttc ? ttcGuideRoutes : regionalGuideRoutes;
  const stations = ttc ? ttcGuideStations : regionalGuideStations;
  const path = ttc ? "/ttc" : "/go-up";
  const breadcrumbs = [{ label: "Dashboard", href: "/" }, { label: "Explore", href: "/explore" }, { label: networkShortName(networkSlug) }];
  const description = ttc
    ? "Browse TTC subway and LRT lines and mapped stations, then open the LineWatchTO dashboard for source-labeled service alerts, closures, accessibility outages, and reliability."
    : "Browse GO rail corridors, UP Express, and mapped stations, then open the LineWatchTO dashboard for freshness-gated regional service information and reliability.";

  return (
    <main className={styles.main}>
      <Breadcrumbs items={breadcrumbs} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${networkName(networkSlug)} lines and stations`,
        url: absoluteUrl(path),
        description,
      }} />
      <PageHero
        eyebrow={ttc ? "Toronto rapid transit" : "Regional rail"}
        title={`${networkName(networkSlug)} lines and stations`}
        actions={(
          <>
            <a className={styles.cta} href={networkDashboardUrl(networkSlug)}>Open interactive map</a>
            <a className={styles.secondaryCta} href={`${path}/reliability`}>Reliability methodology</a>
          </>
        )}
      >
        {description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>{ttc ? "Lines" : "Corridors"}</h2><span className={styles.note}>{routes.length} mapped</span></div>
            <RouteList routes={routes} />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>Station directory</h2><span className={styles.note}>{stations.length} mapped stations and stops</span></div>
            <StationDirectory stations={stations} />
          </section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2>What the dashboard covers</h2>
            <ul className={styles.plainList}>
              <li>Map-based service impact views</li>
              <li>Planned closures and accessibility outages</li>
              <li>Station details with source labels</li>
              <li>Thirty-day reliability with coverage confidence</li>
            </ul>
          </section>
          <SourceDisclaimer networkSlug={networkSlug} />
        </aside>
      </div>
    </main>
  );
}

export function RouteGuidePage({ route }: { route: TransitGuideRoute }) {
  const ttc = route.networkSlug === "ttc";
  const stations = stationsForGuideRoute(route);
  const parentPath = ttc ? "/ttc" : "/go-up";
  const path = routeGuidePath(route);
  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: networkShortName(route.networkSlug), href: parentPath },
    { label: ttc ? "Lines" : "Corridors", href: parentPath },
    { label: route.name },
  ];

  return (
    <main className={styles.main}>
      <Breadcrumbs items={breadcrumbs} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${ttc ? `TTC Line ${route.number}` : route.number} ${route.name}`,
        url: absoluteUrl(path),
        description: route.description,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: stations.length,
          itemListElement: stations.map((station, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: station.name,
            url: absoluteUrl(stationGuidePath(station)),
          })),
        },
      }} />
      <PageHero
        eyebrow={ttc ? "TTC line guide" : "Regional corridor guide"}
        title={`${ttc ? `Line ${route.number}` : route.number} ${route.name}`}
        actions={(
          <>
            <a className={styles.cta} href={networkDashboardUrl(route.networkSlug, "status")}>Check dashboard status</a>
            <a className={styles.secondaryCta} href={`${parentPath}/reliability`}>View reliability methodology</a>
          </>
        )}
      >
        {route.description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>Mapped stations</h2><span className={styles.note}>{stations.length} stops represented</span></div>
            <StationDirectory stations={stations} />
          </section>
          <SourceDisclaimer networkSlug={route.networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2>Route reference</h2>
            <dl className={styles.facts}>
              <div><dt>Route</dt><dd>{route.routeLabel}</dd></div>
              <div><dt>Directions</dt><dd>{route.directionLabel}</dd></div>
              <div><dt>Network</dt><dd>{networkName(route.networkSlug)}</dd></div>
              <div><dt>Stations shown</dt><dd>{stations.length}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function StationGuidePage({ station }: { station: TransitGuideStation }) {
  const ttc = station.networkSlug === "ttc";
  const parentPath = ttc ? "/ttc" : "/go-up";
  const path = stationGuidePath(station);
  const adjacentGroups = adjacentStationsForGuideStation(station);
  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: networkShortName(station.networkSlug), href: parentPath },
    { label: "Stations", href: parentPath },
    { label: station.name },
  ];
  const routeNames = station.routes.map((route) => ttc ? `Line ${route.number}` : route.name).join(", ");
  const description = `${station.name} is represented on ${routeNames || networkName(station.networkSlug)} in LineWatchTO. Review mapped routes and accessibility reference information, or open the interactive dashboard for freshness-labeled service details.`;

  return (
    <main className={styles.main}>
      <Breadcrumbs items={breadcrumbs} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <JsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${station.name} ${ttc ? "TTC" : "GO/UP"} station guide`,
          url: absoluteUrl(path),
          description,
          about: { "@type": "TrainStation", name: station.name },
        },
        {
          "@context": "https://schema.org",
          "@type": "TrainStation",
          name: station.name,
          url: absoluteUrl(path),
        },
      ]} />
      <PageHero
        eyebrow={`${networkShortName(station.networkSlug)} station guide`}
        title={`${station.name} station`}
        actions={(
          <>
            <a className={styles.cta} href={stationDashboardUrl(station)}>Open station on map</a>
            <a className={styles.secondaryCta} href={parentPath}>Browse all stations</a>
          </>
        )}
      >
        {description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>{ttc ? "Lines at this station" : "Routes at this station"}</h2></div>
            <RouteList routes={station.routes} />
          </section>
          <section className={styles.section}>
            <h2>Reference amenities</h2>
            <p>These are reviewed station-map attributes, not current facility-operation guarantees.</p>
            <ul className={styles.amenityList}>
              <li><span className={station.wheelchairAccessible ? styles.available : styles.unavailable} aria-hidden="true">{station.wheelchairAccessible ? "✓" : "–"}</span>Wheelchair-accessible route</li>
              {station.amenities.map((amenity) => (
                <li key={amenity.label}>
                  <span className={amenity.available ? styles.available : styles.unavailable} aria-hidden="true">{amenity.available ? "✓" : "–"}</span>
                  {amenity.label}
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.section}>
            <h2>Adjacent mapped stations</h2>
            {adjacentGroups.map(({ route, stations }) => (
              <div className={styles.adjacentGroup} key={route.id}>
                <h3>{ttc ? `Line ${route.number} ${route.name}` : route.name}</h3>
                <ul className={styles.adjacentList}>
                  {stations.map((adjacent) => <li key={adjacent.id}><a href={stationGuidePath(adjacent)}>{adjacent.name}</a></li>)}
                </ul>
              </div>
            ))}
          </section>
          <SourceDisclaimer networkSlug={station.networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2>Station reference</h2>
            <dl className={styles.facts}>
              <div><dt>Network</dt><dd>{networkName(station.networkSlug)}</dd></div>
              <div><dt>{ttc ? "Lines" : "Routes"}</dt><dd>{routeNames || "Mapped station"}</dd></div>
              <div><dt>Interchange</dt><dd>{station.interchange ? "Yes" : "No"}</dd></div>
              <div><dt>Current details</dt><dd>Interactive dashboard</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function ReliabilityGuidePage({ networkSlug }: { networkSlug: TransitGuideNetworkSlug }) {
  const ttc = networkSlug === "ttc";
  const parentPath = ttc ? "/ttc" : "/go-up";
  const path = `${parentPath}/reliability`;
  const breadcrumbs = [{ label: "Dashboard", href: "/" }, { label: networkShortName(networkSlug), href: parentPath }, { label: "Reliability" }];
  const source = ttc ? "retained normalized TTC alert lifecycles" : "retained normalized Metrolinx alert lifecycles";

  return (
    <main className={styles.main}>
      <Breadcrumbs items={breadcrumbs} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${networkName(networkSlug)} reliability methodology`,
        url: absoluteUrl(path),
        description: `How LineWatchTO calculates coverage-aware 30-day ${networkShortName(networkSlug)} disruption metrics.`,
      }} />
      <PageHero
        eyebrow="Reliability methodology"
        title={`How LineWatchTO measures ${networkShortName(networkSlug)} reliability`}
        actions={<a className={styles.cta} href={networkDashboardUrl(networkSlug, "analytics")}>Open reliability dashboard</a>}
      >
        LineWatchTO summarizes a rolling 30-day observation window from {source}. Results are coverage-aware and are not presented as official agency performance statistics.
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={styles.section}>
            <h2>What is counted</h2>
            <ul className={styles.plainList}>
              <li>Normalized rail service-impact intervals that overlap verified successful polling.</li>
              <li>Only the applicable published daily service span when schedule coverage is available.</li>
              <li>Planned closures only during their applicable active windows.</li>
              <li>Unique service-impact time separately from additive incident-hours, so overlapping incidents are not hidden.</li>
            </ul>
          </section>
          <section className={styles.section}>
            <h2>Coverage and confidence</h2>
            <p>Polling coverage and schedule-date coverage are reported separately. Confidence uses the weaker available coverage source, which keeps gaps visible instead of treating missing observations as normal service.</p>
            {!ttc ? <p>Regional history begins with LineWatchTO&apos;s regional reliability migration, so early GO/UP results can remain explicitly low-confidence while coverage accumulates.</p> : null}
          </section>
          <section className={styles.section}>
            <h2>What is excluded</h2>
            <ul className={styles.plainList}>
              <li>Accessibility outages and surface service notices.</li>
              <li>Station arrivals and estimated schematic train markers.</li>
              {!ttc ? <li>Train cancellations and operational trip changes, which remain separate from corridor status and reliability incidents.</li> : null}
              <li>Any claim that a whole line or corridor was disrupted when an alert affected only part of it.</li>
            </ul>
          </section>
          <SourceDisclaimer networkSlug={networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2>Read results carefully</h2>
            <p>A 100% affected-line observation means at least one counted alert existed somewhere on that line during all observed service minutes. It does not mean every station or segment was disrupted.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
