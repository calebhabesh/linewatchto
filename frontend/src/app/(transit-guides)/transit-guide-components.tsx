/* eslint-disable @next/next/no-html-link-for-pages -- full navigation keeps the static guide pages free of client router code */
import type { ReactNode } from "react";
import Image from "next/image";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  Compass,
  ConciergeBell,
  GitMerge,
  Info,
  Layers,
  Map,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  Train,
  Wifi,
} from "lucide-react";
import { JsonLd } from "../../components/JsonLd";
import { TransitLineBadge } from "../../components/TransitLineBadge";
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
  type TransitGuideAmenity,
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
  return networkSlug === "ttc" ? "TTC Subway & LRT" : "GO Transit and UP Express";
}

function networkPageTitle(networkSlug: TransitGuideNetworkSlug) {
  return networkSlug === "ttc" ? "TTC Subway, LRT Lines, and Stations" : "GO Transit and UP Express Lines and Stations";
}

function networkShortName(networkSlug: TransitGuideNetworkSlug) {
  return networkSlug === "ttc" ? "TTC" : "GO & UP";
}

function networkDashboardUrl(networkSlug: TransitGuideNetworkSlug, panel?: string) {
  const params = new URLSearchParams({ network: networkSlug === "ttc" ? "ttc" : "regional" });
  if (panel) params.set("panel", panel);
  return `/?${params.toString()}`;
}

function routeDashboardUrl(route: TransitGuideRoute) {
  const params = new URLSearchParams({
    network: route.networkSlug === "ttc" ? "ttc" : "regional",
    line: route.id,
  });
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
      <ol className={styles.breadcrumbList}>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className={styles.breadcrumbItem}>
            {index > 0 && (
              <span className={styles.breadcrumbSeparator} aria-hidden="true">
                /
              </span>
            )}
            {item.href ? (
              <a href={item.href} className={styles.breadcrumbLink}>
                {item.label}
              </a>
            ) : (
              <span className={styles.breadcrumbCurrent} aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
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

function RouteBadge({ route, size = 38 }: { route: TransitGuideRoute; size?: number }) {
  return (
    <TransitLineBadge
      lineId={route.id}
      lineNumber={route.number}
      lineName={route.name}
      size={size}
      className={styles.routeBadge}
    />
  );
}

function PageHero({
  eyebrow,
  title,
  children,
  actions,
  badge,
  badges,
  caption,
  accentColor,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  badges?: ReactNode;
  caption?: string;
  accentColor?: string;
}) {
  return (
    <header className={styles.hero}>
      {accentColor ? (
        <div className={styles.heroAccentBar} style={{ backgroundColor: accentColor }} />
      ) : null}
      <div className={styles.heroTopMeta}>
        <p
          className={styles.eyebrow}
          style={accentColor ? ({ "--chip-color": accentColor } as React.CSSProperties) : undefined}
        >
          <span className={styles.eyebrowBar} aria-hidden="true" />
          {eyebrow}
        </p>
        <span className={styles.note} style={{ color: "#64748b" }}>
          LineWatch Transit Atlas
        </span>
      </div>
      <div className={styles.heroMainBody}>
        {caption ? <span className={styles.stationCaption}>{caption}</span> : null}
        <div className={styles.heroHeaderGroup}>
          {badge}
          <h1>{title}</h1>
        </div>
        {badges ? <div className={styles.heroBadges}>{badges}</div> : null}
        <div className={styles.lede}>{children}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </header>
  );
}

function RouteList({ routes }: { routes: TransitGuideRoute[] }) {
  return (
    <ul className={styles.routeList}>
      {routes.map((route) => {
        const stopCount = route.stationIds.length;
        return (
          <li key={route.id}>
            <a
              className={styles.routeLink}
              href={routeGuidePath(route)}
              style={{ borderLeftColor: route.color, borderLeftWidth: 4 }}
            >
              <RouteBadge route={route} size={38} />
              <div>
                <strong>{route.name}</strong>
                <small>{route.routeLabel}</small>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <span className={styles.pillBadge} style={{ fontSize: "0.72rem", padding: "3px 8px" }}>
                    {route.directionLabel}
                  </span>
                  <span className={styles.pillBadge} style={{ fontSize: "0.72rem", padding: "3px 8px" }}>
                    {stopCount} {stopCount === 1 ? "stop" : "stops"}
                  </span>
                </div>
              </div>
              <ArrowRight size={20} strokeWidth={2.5} className={styles.routeLinkArrow} aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function StationDirectory({ stations }: { stations: TransitGuideStation[] }) {
  return (
    <ul className={styles.directory}>
      {stations.map((station) => (
        <li key={station.id}>
          <a href={stationGuidePath(station)}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {station.name}
            </span>
            <span className={styles.stationDirectoryBadges}>
              {station.wheelchairAccessible ? (
                <Image
                  src="/assets/linewatch/accessible.svg"
                  alt="Accessible"
                  width={15}
                  height={15}
                  className="shrink-0"
                />
              ) : null}
              {station.routes.map((r) => (
                <span
                  key={r.id}
                  className={styles.stationDirectoryBadge}
                  style={{ backgroundColor: r.color }}
                  title={r.name}
                />
              ))}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function RouteStationSequence({ route }: { route: TransitGuideRoute }) {
  const stations = stationsForGuideRoute(route);
  return (
    <ol className={styles.trackSequence}>
      {stations.map((station, index) => {
        const isFirst = index === 0;
        const isLast = index === stations.length - 1;
        const isTerminal = isFirst || isLast;
        const transferRoutes = station.routes.filter((r) => r.id !== route.id);
        const padIndex = String(index + 1).padStart(2, "0");

        return (
          <li className={styles.trackStop} key={station.id}>
            <span className={styles.trackStopNum}>{padIndex}</span>
            <div className={styles.trackLineCol}>
              <div
                className={`${styles.trackLineBar} ${isFirst ? styles.trackLineBarFirst : ""} ${isLast ? styles.trackLineBarLast : ""}`}
                style={{ backgroundColor: route.color }}
              />
              <div
                className={isTerminal ? styles.trackStopDotTerminal : styles.trackStopDot}
                style={{ borderColor: route.color }}
              />
            </div>
            <a className={styles.trackStopName} href={stationGuidePath(station)}>
              {station.name}
            </a>
            <div className={styles.trackMetaGroup}>
              {isTerminal ? (
                <span className={styles.terminalTag}>
                  <ArrowDownToLine size={11} aria-hidden="true" className="shrink-0" />
                  Terminal
                </span>
              ) : null}
              {station.wheelchairAccessible ? (
                <span title="Wheelchair accessible" className={styles.trackAccessibleBadge}>
                  <Image
                    src="/assets/linewatch/accessible.svg"
                    alt="Accessible"
                    width={16}
                    height={16}
                    className={styles.trackAccessibleIcon}
                  />
                </span>
              ) : null}
              {transferRoutes.length > 0 ? (
                <div className={styles.trackTransferBadges} title="Transfer connections">
                  {transferRoutes.map((tr) => (
                    <RouteBadge key={tr.id} route={tr} size={22} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StationAmenityBadge({
  iconSrc,
  alt,
  label,
  iconClass,
  isWifi,
}: {
  iconSrc?: string;
  alt: string;
  label: string;
  iconClass?: string;
  isWifi?: boolean;
}) {
  return (
    <div className={styles.amenityItem} title={`${label} available`}>
      {isWifi ? (
        <div className={styles.amenityIconWifiWrap}>
          <Wifi size={16} className="shrink-0" aria-hidden="true" />
        </div>
      ) : iconSrc ? (
        <Image
          src={iconSrc}
          alt={alt}
          width={28}
          height={28}
          className={iconClass || styles.amenityIconDefault}
        />
      ) : null}
      <span className={styles.amenityLabel}>{label}</span>
    </div>
  );
}

function StationAmenitiesSection({ station }: { station: TransitGuideStation }) {
  const availableItems: Array<{ key: string; label: string; iconSrc?: string; iconClass?: string; isWifi?: boolean }> = [];

  if (station.wheelchairAccessible) {
    availableItems.push({
      key: "accessible",
      label: "Accessible",
      iconSrc: "/assets/linewatch/accessible.svg",
      iconClass: styles.amenityIconAccessible,
    });
  }

  for (const amenity of station.amenities) {
    if (!amenity.available) continue;
    const lower = amenity.label.toLowerCase();
    if (lower.includes("elevator")) {
      availableItems.push({
        key: "elevator",
        label: "Elevators",
        iconSrc: "/assets/linewatch/outages/elevator.svg",
        iconClass: styles.amenityIconElevator,
      });
    } else if (lower.includes("washroom")) {
      availableItems.push({
        key: "washroom",
        label: "Washrooms",
        iconSrc: "/assets/linewatch/washroom.svg",
        iconClass: styles.amenityIconWashroom,
      });
    } else if (lower.includes("parking")) {
      availableItems.push({
        key: "parking",
        label: "Parking",
        iconSrc: "/assets/linewatch/parking.svg",
        iconClass: styles.amenityIconParking,
      });
    } else if (lower.includes("lockup") || lower.includes("lock-up") || lower.includes("rack")) {
      availableItems.push({
        key: "bike-lockup",
        label: station.networkSlug === "ttc" ? "Bike Lock-up" : "Bike Rack",
        iconSrc: "/assets/linewatch/bicycle-lockup.svg",
        iconClass: styles.amenityIconBicycle,
      });
    } else if (lower.includes("repair")) {
      availableItems.push({
        key: "bike-repair",
        label: "Bike Repair",
        iconSrc: "/assets/linewatch/bicycle-repair.svg",
        iconClass: styles.amenityIconBicycle,
      });
    } else if (lower.includes("share")) {
      availableItems.push({
        key: "bike-share",
        label: "Bike Share",
        iconSrc: "/assets/linewatch/bike-share-toronto.svg",
        iconClass: styles.amenityIconBikeShare,
      });
    } else if (lower.includes("pick-up") || lower.includes("drop-off") || lower.includes("ppudo")) {
      availableItems.push({
        key: "ppudo",
        label: "Passenger Pick-up",
        iconSrc: "/assets/linewatch/passenger-pick-up.svg",
        iconClass: styles.amenityIconPpudo,
      });
    } else if (lower.includes("wi-fi") || lower.includes("wifi")) {
      availableItems.push({
        key: "wifi",
        label: "Wi-Fi",
        isWifi: true,
      });
    }
  }

  return (
    <section className={styles.section} data-station-section="services-and-amenities">
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingLeft}>
          <span className={styles.sectionHeaderBar} />
          <ConciergeBell size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
          <h2>Services &amp; Amenities</h2>
        </div>
      </div>
      <p>These are reviewed station-map attributes, not current facility-operation guarantees.</p>
      {availableItems.length > 0 ? (
        <div className={styles.amenityGrid}>
          {availableItems.map((item) => (
            <StationAmenityBadge
              key={item.key}
              label={item.label}
              alt={item.label}
              iconSrc={item.iconSrc}
              iconClass={item.iconClass}
              isWifi={item.isWifi}
            />
          ))}
        </div>
      ) : (
        <p className={styles.emptyAmenityNote}>No additional station amenities listed for this stop.</p>
      )}
    </section>
  );
}

function SourceDisclaimer({ networkSlug }: { networkSlug: TransitGuideNetworkSlug }) {
  return (
    <section className={`${styles.section} ${styles.disclaimer}`}>
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingLeft} style={{ "--chip-color": "#f59e0b" } as React.CSSProperties}>
          <span className={styles.sectionHeaderBar} />
          <AlertCircle size={18} className="shrink-0 text-amber-400" aria-hidden="true" />
          <h2>Source &amp; Freshness</h2>
        </div>
      </div>
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
        name: "Toronto Rapid Transit Information",
        url: absoluteUrl("/explore"),
        description: "TTC subway and LRT, GO Transit, UP Express, station, corridor, and reliability guides from LineWatchTO.",
      }} />
      <PageHero
        eyebrow="Transit Information"
        title="Explore Toronto Rapid Transit"
        badges={(
          <>
            <span className={`${styles.pillBadge} ${styles.pillBadgeAccent}`}>
              5 TTC Lines · 8 GO/UP Corridors
            </span>
            <span className={styles.pillBadge}>181 Mapped Stations</span>
            <span className={`${styles.pillBadge} ${styles.pillBadgeSuccess}`}>30-Day Reliability</span>
          </>
        )}
        actions={(
          <>
            <a className={styles.cta} href="/">
              <Map size={16} aria-hidden="true" />
              <span>View Live Map</span>
              <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
            </a>
            <a className={styles.secondaryCta} href="/ttc/reliability">
              <Activity size={16} aria-hidden="true" />
              <span>Reliability Methodology</span>
            </a>
          </>
        )}
      >
        Find TTC subway and LRT lines, GO rail corridors, UP Express, mapped stations, accessibility reference information, and LineWatchTO reliability methodology. The dashboard remains the place to check source-labeled current conditions.
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <RouteIcon size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>TTC Subway, LRT Lines, and Stations</h2>
              </div>
              <a className={styles.sectionActionLink} href="/ttc">
                <span>All TTC Information</span>
                <ArrowRight size={13} className={styles.sectionActionLinkIcon} aria-hidden="true" />
              </a>
            </div>
            <RouteList routes={ttcGuideRoutes} />
          </section>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft} style={{ "--chip-color": "#10b981" } as React.CSSProperties}>
                <span className={styles.sectionHeaderBar} />
                <Train size={18} className="shrink-0 text-emerald-400" aria-hidden="true" />
                <h2>GO Transit and UP Express</h2>
              </div>
              <a className={styles.sectionActionLink} href="/go-up">
                <span>All Regional Information</span>
                <ArrowRight size={13} className={styles.sectionActionLinkIcon} aria-hidden="true" />
              </a>
            </div>
            <RouteList routes={regionalGuideRoutes} />
          </section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Compass size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>Reliability Guides</h2>
              </div>
            </div>
            <ul className={styles.plainList}>
              <li><a className={styles.link} href="/ttc/reliability">How TTC Reliability Is Measured</a></li>
              <li><a className={styles.link} href="/go-up/reliability">How GO/UP Reliability Is Measured</a></li>
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
        name: networkPageTitle(networkSlug),
        url: absoluteUrl(path),
        description,
      }} />
      <PageHero
        eyebrow={ttc ? "Toronto Rapid Transit" : "Regional Rail"}
        title={networkPageTitle(networkSlug)}
        badges={(
          <>
            <span className={`${styles.pillBadge} ${styles.pillBadgeAccent}`}>
              {routes.length} {ttc ? "Rapid Transit Lines" : "Rail Corridors"}
            </span>
            <span className={styles.pillBadge}>
              {stations.length} Mapped Stops
            </span>
          </>
        )}
        actions={(
          <>
            <a className={styles.cta} href={networkDashboardUrl(networkSlug)}>
              <Map size={16} aria-hidden="true" />
              <span>View {networkShortName(networkSlug)} Live Map</span>
              <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
            </a>
            <a className={styles.secondaryCta} href={`${path}/reliability`}>
              <Activity size={16} aria-hidden="true" />
              <span>Reliability Methodology</span>
            </a>
          </>
        )}
      >
        {description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Layers size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>{ttc ? "Lines" : "Corridors"}</h2>
              </div>
              <span className={styles.note}>{routes.length} mapped</span>
            </div>
            <RouteList routes={routes} />
          </section>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <MapPin size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>Station Directory</h2>
              </div>
              <span className={styles.note}>{stations.length} mapped stations and stops</span>
            </div>
            <StationDirectory stations={stations} />
          </section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <ShieldCheck size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>What The Dashboard Covers</h2>
              </div>
            </div>
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
        eyebrow={ttc ? "TTC Line Guide" : "Regional Corridor Guide"}
        title={`${ttc ? `Line ${route.number}` : route.number} ${route.name}`}
        badge={<RouteBadge route={route} size={48} />}
        badges={(
          <>
            <span className={`${styles.pillBadge} ${styles.pillBadgeAccent}`}>
              {networkName(route.networkSlug)}
            </span>
            <span className={styles.pillBadge}>
              {route.directionLabel}
            </span>
            <span className={`${styles.pillBadge} ${styles.pillBadgeSuccess}`}>
              {stations.length} Mapped Stops
            </span>
          </>
        )}
        actions={(
          <>
            <a className={styles.cta} href={routeDashboardUrl(route)}>
              <Activity size={16} aria-hidden="true" />
              <span>Check Live Status</span>
              <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
            </a>
            <a className={styles.secondaryCta} href={`${parentPath}/reliability`}>
              <Compass size={16} aria-hidden="true" />
              <span>View Reliability Methodology</span>
            </a>
          </>
        )}
        accentColor={route.color}
      >
        {route.description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft} style={{ "--chip-color": route.color } as React.CSSProperties}>
                <span className={styles.sectionHeaderBar} />
                <RouteIcon size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>Route Station Sequence</h2>
              </div>
              <span className={styles.note}>{stations.length} stops represented</span>
            </div>
            <RouteStationSequence route={route} />
          </section>
          <SourceDisclaimer networkSlug={route.networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Info size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>Route Reference</h2>
              </div>
            </div>
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
          name: `${station.name} ${ttc ? "TTC" : "GO/UP"} Station Guide`,
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
        eyebrow={`${networkShortName(station.networkSlug)} Station Guide`}
        caption="Station"
        title={station.name}
        badges={(
          <>
            {station.routes.map((r) => (
              <RouteBadge key={r.id} route={r} size={28} />
            ))}
            {station.wheelchairAccessible ? (
              <span className={`${styles.pillBadge} ${styles.pillBadgeSuccess}`}>
                <Image
                  src="/assets/linewatch/accessible.svg"
                  alt=""
                  width={15}
                  height={15}
                  className="shrink-0"
                />
                <span>Wheelchair Accessible</span>
              </span>
            ) : (
              <span className={styles.pillBadge}>Standard Access</span>
            )}
            {station.interchange ? (
              <span className={`${styles.pillBadge} ${styles.pillBadgeAccent}`}>
                <GitMerge size={13} className="shrink-0 text-blue-400" />
                <span>Interchange Hub</span>
              </span>
            ) : null}
          </>
        )}
        actions={(
          <>
            <a className={styles.cta} href={stationDashboardUrl(station)}>
              <Map size={16} aria-hidden="true" />
              <span>View Station on Live Map</span>
              <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
            </a>
            <a className={styles.secondaryCta} href={parentPath}>
              <ArrowRight size={16} aria-hidden="true" />
              <span>Browse All Stations</span>
            </a>
          </>
        )}
      >
        {description}
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Layers size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>{ttc ? "Lines at This Station" : "Routes at This Station"}</h2>
              </div>
            </div>
            <RouteList routes={station.routes} />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <MapPin size={18} className="shrink-0 text-slate-300" aria-hidden="true" />
                <h2>Adjacent Mapped Stations</h2>
              </div>
            </div>
            {adjacentGroups.map(({ route, stations }) => (
              <div className={styles.adjacentGroup} key={route.id}>
                <div className={styles.adjacentGroupHeader}>
                  <RouteBadge route={route} size={24} />
                  <h3>{ttc ? `Line ${route.number} ${route.name}` : route.name}</h3>
                </div>
                <ul className={styles.adjacentList}>
                  {stations.map((adjacent) => (
                    <li key={adjacent.id}>
                      <a href={stationGuidePath(adjacent)}>
                        <MapPin size={13} />
                        {adjacent.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          <StationAmenitiesSection station={station} />
          <SourceDisclaimer networkSlug={station.networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Info size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>Station Reference</h2>
              </div>
            </div>
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
        name: `${networkName(networkSlug)} Reliability Methodology`,
        url: absoluteUrl(path),
        description: `How LineWatchTO calculates coverage-aware 30-day ${networkShortName(networkSlug)} disruption metrics.`,
      }} />
      <PageHero
        eyebrow="Reliability Methodology"
        title={`How LineWatchTO Measures ${networkShortName(networkSlug)} Reliability`}
        badges={(
          <>
            <span className={`${styles.pillBadge} ${styles.pillBadgeAccent}`}>
              Rolling 30-Day Window
            </span>
            <span className={`${styles.pillBadge} ${styles.pillBadgeSuccess}`}>
              Coverage-Aware Metrics
            </span>
          </>
        )}
        actions={(
          <a className={styles.cta} href={networkDashboardUrl(networkSlug, "analytics")}>
            <Activity size={16} aria-hidden="true" />
            <span>Open Reliability Dashboard</span>
            <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
          </a>
        )}
      >
        LineWatchTO summarizes a rolling 30-day observation window from {source}. Results are coverage-aware and are not presented as official agency performance statistics.
      </PageHero>
      <div className={styles.contentGrid}>
        <div className={styles.content}>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft} style={{ "--chip-color": "#10b981" } as React.CSSProperties}>
                <span className={styles.sectionHeaderBar} />
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400" aria-hidden="true" />
                <h2>What Is Counted</h2>
              </div>
            </div>
            <ul className={styles.plainList}>
              <li>Normalized rail service-impact intervals that overlap verified successful polling.</li>
              <li>Only the applicable published daily service span when schedule coverage is available.</li>
              <li>Planned closures only during their applicable active windows.</li>
              <li>Unique service-impact time separately from additive incident-hours, so overlapping incidents are not hidden.</li>
              {!ttc ? <li>Distinct observed train cancellations as a separate count, with exact schedule matches distinguished from source-labeled unmatched notices.</li> : null}
            </ul>
          </section>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft} style={{ "--chip-color": "#3b82f6" } as React.CSSProperties}>
                <span className={styles.sectionHeaderBar} />
                <ShieldCheck size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>Coverage &amp; Confidence</h2>
              </div>
            </div>
            <p>Polling coverage and schedule-date coverage are reported separately. Confidence uses the weaker available coverage source, which keeps gaps visible instead of treating missing observations as normal service.</p>
            {!ttc ? <p>Regional history begins with LineWatchTO&apos;s regional reliability migration, so early GO/UP results can remain explicitly low-confidence while coverage accumulates.</p> : null}
          </section>
          <section className={`${styles.section} ${styles.cardTopAccent}`}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft} style={{ "--chip-color": "#ef4444" } as React.CSSProperties}>
                <span className={styles.sectionHeaderBar} />
                <AlertCircle size={18} className="shrink-0 text-red-400" aria-hidden="true" />
                <h2>What Is Excluded</h2>
              </div>
            </div>
            <ul className={styles.plainList}>
              <li>Accessibility outages and surface service notices.</li>
              <li>Station arrivals and estimated schematic train markers.</li>
              {!ttc ? <li>Train cancellations and other operational trip changes from reliability incidents, corridor status, and duration calculations; only the separate cancellation insight counts them.</li> : null}
              <li>Any claim that a whole line or corridor was disrupted when an alert affected only part of it.</li>
            </ul>
          </section>
          <SourceDisclaimer networkSlug={networkSlug} />
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingLeft}>
                <span className={styles.sectionHeaderBar} />
                <Info size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
                <h2>Read Results Carefully</h2>
              </div>
            </div>
            <p>A 100% affected-line observation means at least one counted alert existed somewhere on that line during all observed service minutes. It does not mean every station or segment was disrupted.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
