"use client";

import { Search, SunMoon, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildVisualPreferencesCookie,
  defaultVisualPreferences,
  readVisualPreferencesFromStorage,
  visualPreferenceStorageKeys,
} from "../visual-preferences";
import styles from "./transit-guide.module.css";

type DirectoryStation = {
  id: string;
  name: string;
  href: string;
  wheelchairAccessible: boolean;
  routes: Array<{ id: string; name: string; color: string }>;
};

function applyStoredDisplayPreferences() {
  const shell = document.querySelector<HTMLElement>("[data-guide-shell]");
  if (!shell) return defaultVisualPreferences.theme;

  const stored = readVisualPreferencesFromStorage(window.localStorage);
  const theme = stored.theme ?? defaultVisualPreferences.theme;
  shell.classList.toggle("dark", theme === "dark" || stored.highContrast === true);
  shell.classList.toggle("high-contrast", stored.highContrast === true);
  shell.classList.toggle("motion-paused", stored.reducedMotion === true);
  return theme;
}

export function GuideNav() {
  const pathname = usePathname();
  const reliabilityHref = pathname.startsWith("/go-up") ? "/go-up/reliability" : "/ttc/reliability";
  const activeKey = pathname.endsWith("/reliability")
    ? "reliability"
    : pathname.startsWith("/ttc")
      ? "ttc"
      : pathname.startsWith("/go-up")
        ? "go-up"
        : "explore";

  function toggleTheme() {
    const currentTheme = readVisualPreferencesFromStorage(window.localStorage).theme ?? defaultVisualPreferences.theme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    window.localStorage.setItem(visualPreferenceStorageKeys.theme, nextTheme);
    const stored = readVisualPreferencesFromStorage(window.localStorage);
    document.cookie = buildVisualPreferencesCookie({
      theme: nextTheme,
      highContrast: stored.highContrast ?? defaultVisualPreferences.highContrast,
      reducedMotion: stored.reducedMotion,
      estimatedTrainsEnabled: stored.estimatedTrainsEnabled ?? defaultVisualPreferences.estimatedTrainsEnabled,
      dotBackgroundEnabled: stored.dotBackgroundEnabled ?? defaultVisualPreferences.dotBackgroundEnabled,
      defaultNetwork: stored.defaultNetwork ?? defaultVisualPreferences.defaultNetwork,
      mapView: stored.mapView ?? defaultVisualPreferences.mapView,
    }, window.location.protocol);
    applyStoredDisplayPreferences();
  }

  const links = [
    { key: "explore", href: "/explore", label: "Explore" },
    { key: "ttc", href: "/ttc", label: "TTC" },
    { key: "go-up", href: "/go-up", label: "GO & UP" },
    { key: "reliability", href: reliabilityHref, label: "Reliability" },
  ];

  return (
    <div className={styles.navGroup}>
      <nav className={styles.nav} aria-label="Transit guides">
        {links.map((link) => (
          <a key={link.key} href={link.href} aria-current={activeKey === link.key ? "page" : undefined}>
            {link.label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        <SunMoon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function StationDirectoryFilter({ stations }: { stations: DirectoryStation[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("en-CA");
  const filteredStations = useMemo(
    () => normalizedQuery
      ? stations.filter((station) => station.name.toLocaleLowerCase("en-CA").includes(normalizedQuery))
      : stations,
    [normalizedQuery, stations],
  );

  return (
    <div className={styles.directoryFilter}>
      <div className={styles.directoryToolbar}>
        <label className={styles.directorySearch}>
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Filter stations</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter stations"
            aria-controls="station-directory-list"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear station filter">
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <p className={styles.directoryCount} aria-live="polite">
          {filteredStations.length} of {stations.length} stations
        </p>
      </div>
      {filteredStations.length ? (
        <ul className={styles.directory} id="station-directory-list">
          {filteredStations.map((station) => (
            <li key={station.id}>
              <a href={station.href}>
                <span className={styles.directoryStationName}>{station.name}</span>
                <span className={styles.stationDirectoryBadges}>
                  {station.wheelchairAccessible ? (
                    <Image src="/assets/linewatch/accessible.svg" alt="Accessible" width={15} height={15} />
                  ) : null}
                  {station.routes.map((route) => (
                    <span
                      key={route.id}
                      className={styles.stationDirectoryBadge}
                      style={{ backgroundColor: route.color }}
                      title={route.name}
                    />
                  ))}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.directoryEmpty}>No stations match “{query.trim()}”.</p>
      )}
    </div>
  );
}
