"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  AlertTriangle,
  Apple,
  Bus,
  Download,
  Earth,
  Info,
  Map as MapIcon,
  MapPin,
  MapPinCheck,
  Menu,
  MousePointer2,
  MoreVertical,
  Navigation,
  Activity,
  Search,
  Signpost,
  Smartphone,
  SquarePlus,
  Sun,
  X,
  ListFilter,
} from "lucide-react";
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

const INFO_OVERLAY_ASSET_BASE = "/assets/linewatch/info-map-overlays/";

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="site-guide-section">
      <div className="site-guide-section-title">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function GuideActionRow({
  icon,
  label,
  text,
}: {
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <li className="site-guide-action-row">
      <span className="site-guide-action-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <span>{text}</span>
      </span>
    </li>
  );
}

function GuideAssetIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={14}
      height={14}
      className="site-guide-install-asset-icon"
    />
  );
}

function MobileInstallGuide({
  icon,
  title,
  steps,
}: {
  icon: ReactNode;
  title: string;
  steps: Array<{
    icon: ReactNode;
    label: string;
    text: string;
  }>;
}) {
  return (
    <div className="site-guide-install-device">
      <div className="site-guide-install-device-title">
        {icon}
        <h4>{title}</h4>
      </div>
      <ol className="site-guide-install-steps">
        {steps.map((step, index) => (
          <li className="site-guide-install-step" key={step.label}>
            <span className="site-guide-install-number">{index + 1}</span>
            <span className="site-guide-action-icon">{step.icon}</span>
            <span>
              <strong>{step.label}</strong>
              <span>{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OverlayGuideRow({
  icon,
  title,
  text,
  previews,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  previews: ReactNode;
}) {
  return (
    <li className="site-guide-overlay-row items-center gap-3">
      <div className="flex flex-col gap-2 shrink-0 w-[88px] justify-center">
        {previews}
      </div>
      <span className="site-guide-overlay-copy flex-1">
        <strong>
          <span className="site-guide-overlay-icon !mt-0 align-text-bottom" style={{ marginRight: '4px' }}>{icon}</span>
          {" "}
          {title}
        </strong>
        <span>{text}</span>
      </span>
    </li>
  );
}

function OverlayAssetPreview({
  fileName,
  label,
  className = "",
  labelClassName = "",
}: {
  fileName: string;
  label: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <Image
        src={`${INFO_OVERLAY_ASSET_BASE}${fileName}`}
        alt=""
        aria-hidden="true"
        width={88}
        height={30}
        className={`site-guide-overlay-asset ${className}`}
      />
      <span className={`block w-full text-center text-[9px] leading-tight text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5 ${labelClassName}`}>
        {label}
      </span>
    </div>
  );
}

const SITE_GUIDE_SEEN_STORAGE_KEY = "linewatch-site-guide-seen-v1";

export interface SiteGuideDropdownProps {
  onOpenChange?: (open: boolean) => void;
  variant?: "default" | "chip";
  open?: boolean;
  hideTrigger?: boolean;
}

export function SiteGuideDropdown({
  onOpenChange,
  variant = "default",
  open,
  hideTrigger = false,
}: SiteGuideDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayedOpen = open ?? isOpen;
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  /** True once the user has ever opened the guide (persisted in localStorage). */
  const [guideSeen, setGuideSeen] = useState(() => {
    if (typeof window === "undefined") return true; // SSR: suppress pulse
    try {
      return window.localStorage.getItem(SITE_GUIDE_SEEN_STORAGE_KEY) === "true";
    } catch {
      return true; // storage unavailable — suppress pulse
    }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const closeTimerRef = useRef<number | null>(null);

  const closeGuide = useCallback(() => {
    if (!displayedOpen || isClosing) return;
    setIsClosing(true);
    const container = dropdownRef.current ?? triggerRef.current;
    const reducedMotion = Boolean(container?.closest(".motion-paused"))
      || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    closeTimerRef.current = window.setTimeout(() => {
      if (open === undefined) setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
      onOpenChange?.(false);
      triggerRef.current?.focus();
    }, reducedMotion ? 0 : 220);
  }, [displayedOpen, isClosing, onOpenChange, open]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (displayedOpen && !isClosing) {
      const timer = setTimeout(() => {
        panelRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [displayedOpen, isClosing]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent | MouseEvent) {
      const target = event.target as Node;
      const insideTrigger = (dropdownRef.current && dropdownRef.current.contains(target))
        || (triggerRef.current && triggerRef.current.contains(target));
      const insidePanel = panelRef.current && panelRef.current.contains(target);
      if (!insideTrigger && !insidePanel) {
        closeGuide();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeGuide();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeGuide]);

  const handleToggle = () => {
    if (displayedOpen) {
      closeGuide();
      return;
    }
    /* Mark the guide as seen on first open so the pulse never returns. */
    if (!guideSeen) {
      setGuideSeen(true);
      try { window.localStorage.setItem(SITE_GUIDE_SEEN_STORAGE_KEY, "true"); } catch { /* noop */ }
    }
    setIsClosing(false);
    if (open === undefined) setIsOpen(true);
    onOpenChange?.(true);
  };

  const portalTarget = typeof document !== "undefined"
    ? (document.getElementById("mobile-app-info-slot")
       || document.querySelector(".mobile-app-info")
       || document.querySelector(".linewatch-shell")
       || document.body)
    : null;

  const panelContent = (
    <>
      {(displayedOpen && (isMobile || variant === "chip")) ? (
        <div
          className={`site-guide-backdrop fixed inset-0 z-[67] transition-opacity duration-200 ${isClosing ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          onClick={closeGuide}
          aria-hidden="true"
        />
      ) : null}

      {displayedOpen ? (
        <section
          ref={panelRef}
          tabIndex={-1}
          id={panelId}
          className={`site-guide-panel utility-popover ${isClosing ? "utility-popover--closing" : "utility-popover--opening"} outline-none`}
          data-popover-state={isClosing ? "closing" : "open"}
          role="dialog"
          aria-label="LineWatchTO site guide"
        >
          <div className="site-guide-header">
            <div className="site-guide-title">
              <Info size={18} aria-hidden="true" />
              <div>
                <h2><span className="linewatch-wordmark">LineWatchTO</span> Guide</h2>
                <p>Unofficial TTC subway/LRT and GO/UP rail reliability dashboard.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                closeGuide();
              }}
              aria-label="Close site guide"
            >
              <X size={17} />
            </button>
          </div>

          <div className="site-guide-body">
            <GuideSection
              icon={
                <Image
                  src="/assets/linewatch/logo.svg"
                  alt=""
                  aria-hidden="true"
                  width={24}
                  height={24}
                  className="shrink-0"
                />
              }
              title="What LineWatchTO Does"
            >
              <p>
                LineWatchTO covers TTC subway/LRT and GO/UP rail, showing alerts, delays, reduced speed zones, planned advisories, and station details across both networks. Save stations to My Stations and set up My Commutes to track how disruptions affect your regular routes. It displays live backend updates when ingestion is running, and falls back to demo fixtures otherwise.
              </p>
            </GuideSection>

            <hr className="site-guide-divider" />

            <GuideSection icon={<Download size={15} />} title="Install LineWatchTO as an App">
              <p>
                For the best mobile experience, add LineWatchTO to your home screen so it opens like an app.
              </p>
              <div className="site-guide-install-options">
                <MobileInstallGuide
                  icon={<Apple size={15} />}
                  title="iOS Safari (iPhone)"
                  steps={[
                    {
                      icon: <Smartphone size={14} />,
                      label: "Open LineWatchTO in Safari",
                      text: "Use Safari on your iPhone.",
                    },
                    {
                      icon: <GuideAssetIcon src="/assets/linewatch/guide-icons/share-iphone.svg" />,
                      label: "Tap Share",
                      text: "Use the Share button in the bottom or top Safari toolbar.",
                    },
                    {
                      icon: <SquarePlus size={14} />,
                      label: "Add to Home Screen",
                      text: "Choose Add to Home Screen, then tap Add.",
                    },
                  ]}
                />
                <MobileInstallGuide
                  icon={<Smartphone size={15} />}
                  title="Android Chrome"
                  steps={[
                    {
                      icon: <Smartphone size={14} />,
                      label: "Open LineWatchTO in Chrome",
                      text: "Use Chrome on your Android phone.",
                    },
                    {
                      icon: <MoreVertical size={14} />,
                      label: "Tap the three-dot menu",
                      text: "Open the Chrome menu at the top right.",
                    },
                    {
                      icon: <GuideAssetIcon src="/assets/linewatch/guide-icons/add-to-homescreen-android.svg" />,
                      label: "Add to Home Screen",
                      text: "Choose Add to Home screen, then confirm.",
                    },
                  ]}
                />
              </div>
            </GuideSection>

            <hr className="site-guide-divider" />

            <GuideSection icon={<Signpost size={15} />} title="How to Use LineWatchTO">
              <ul className="site-guide-action-list">
                <GuideActionRow icon={<MousePointer2 size={14} />} label="Drag The Map" text={isMobile ? "Pan to navigate the network. Pinch to zoom." : "Pan to navigate the network. Scroll or pinch to zoom."} />
                <GuideActionRow
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M7 7L5.5 5.5M15 7L16.5 5.5M5.5 16.5L7 15M11 5L11 3M5 11L3 11M17.1603 16.9887L21.0519 15.4659C21.4758 15.3001 21.4756 14.7003 21.0517 14.5346L11.6992 10.8799C11.2933 10.7213 10.8929 11.1217 11.0515 11.5276L14.7062 20.8801C14.8719 21.304 15.4717 21.3042 15.6375 20.8803L17.1603 16.9887Z" />
                    </svg>
                  }
                  label="Tap a Colored Overlay"
                  text="Tap any line overlay to view its suspension or closure card."
                />
                <GuideActionRow icon={<MapIcon size={14} />} label="Tap a Station" text="Tap a station dot to view accessibility status, alerts, and arrivals. Use the bookmark icon to save it to My Stations for quick access." />
                <GuideActionRow
                  icon={<Navigation size={14} />}
                  label="Monitor My Commutes"
                  text="Choose the TTC or GO/UP rail route you intend to take. LineWatchTO checks that route for disruptions; it does not find the fastest journey or account for buses, walking, and transfer time. For a mixed-network commute, save one route for each system."
                />
                <GuideActionRow icon={<MapPin size={14} />} label="My Stations" text="Save your frequented stations to keep arrivals and service impacts close at hand. Tap the bookmark icon on any station card, or use the My Stations panel." />
                <GuideActionRow icon={<Search size={14} />} label="Station & Alert Search" text="Use the search icon to quickly jump to any station or find service impacts." />
                <GuideActionRow
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M8 12h8M15 9l3 3-3 3" />
                    </svg>
                  }
                  label="Train Markers"
                  text={isMobile ? "Use the Train Markers chip at the top of the map to toggle estimated train positions on or off." : "Use the Train Markers chip at the top left of the map to toggle estimated train positions on or off."}
                />
                <GuideActionRow
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="8" strokeDasharray="3 2" />
                    </svg>
                  }
                  label="Map Mode"
                  text={isMobile ? "Use the TTC / GO/UP switcher on the map to switch between networks. The selected network is what the whole dashboard shows." : "Use the TTC / GO/UP switcher on the map to switch between networks. The selected network drives the entire dashboard view."}
                />
                <GuideActionRow
                  icon={<Earth size={14} />}
                  label="Map View"
                  text="Toggle between the schematic system map and the geographic map view. The schematic is the stylized line diagram; the geographic view places stations on their real-world coordinates."
                />
                {!isMobile && (
                  <GuideActionRow icon={<MapPinCheck size={14} />} label="Default Map" text="Set which network loads on launch from the sidebar. This is separate from switching networks during a session." />
                )}
                {!isMobile && (
                  <GuideActionRow icon={<Menu size={14} />} label="Side Navigation" text="Use the nav rail on the left to switch between Status, My Stations, My Commutes, Alert History, and more." />
                )}
              </ul>
            </GuideSection>

            <hr className="site-guide-divider" />

            <GuideSection icon={<AlertTriangle size={15} />} title="Map Overlays">
              <ul className="site-guide-overlay-list">
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="suspension" size={16} />}
                  title="Suspended or Closed Service"
                  text="Red lane indicates suspended service. One direction displays no-entry and arrow icons, while both ways shows centered no-entry icons."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="1-way-active-alert.svg" label="One Way" />
                      <OverlayAssetPreview fileName="2-way-active.svg" label="Both Ways" />
                    </>
                  }
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="delay" size={16} />}
                  title="Delay"
                  text="Blue lane indicates a delay. One direction displays arrows and hourglasses, while both ways shows hourglasses only."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="1-way-delay.svg" label="One Way" />
                      <OverlayAssetPreview fileName="2-way-delay.svg" label="Both Ways" />
                    </>
                  }
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="reduced-speed-zone" size={16} />}
                  title="Reduced Speed Zone"
                  text="Amber lane with chevrons indicates trains are slowed. One direction shows chevrons pointing forward, while both ways shows offset opposing chevrons."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="1-way-rsz.svg" label="One Way" />
                      <OverlayAssetPreview fileName="2-way-rsz.svg" label="Both Ways" />
                    </>
                  }
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="planned-closure" size={16} />}
                  title="Planned Advisory Preview"
                  text="Smoky-white lane with blue calendar-alert icons previews scheduled closures. Both ways stays static. An explicitly one-way closure uses slowly moving calendars followed by evenly spaced chevrons."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="info-one-way-closure.svg" label="One Way" />
                      <OverlayAssetPreview fileName="info-upcoming-closure.svg" label="Both Ways" />
                    </>
                  }
                />
                <OverlayGuideRow
                  icon={<AlertTriangle size={16} className="text-red-500" />}
                  title="Station Impact Ring"
                  text="Gold ring with a red inner circle highlights station-specific alerts. One direction displays a single arrow inside, while both ways shows arrows in opposite directions."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="station-ring-arrow.svg" label="One Way" className="station-ring-preview" />
                      <OverlayAssetPreview fileName="station-ring-two-way-arrow.svg" label="Both Ways" className="station-ring-preview" />
                    </>
                  }
                />
                <OverlayGuideRow
                  icon={<Info size={16} />}
                  title="Overlap Badge"
                  text="Badge indicates multiple overlapping alerts on a station or segment. The single-icon badge is used when all overlaps are of the same alert type."
                  previews={
                    <>
                      <OverlayAssetPreview fileName="info-overlapping-multi-marker.svg" label="Multiple" className="overlap-badge-preview" />
                      <OverlayAssetPreview fileName="info-overlapping-single-marker.svg" label="Single" className="single-overlap-preview" labelClassName="-translate-x-px" />
                    </>
                  }
                />
              </ul>
            </GuideSection>

            <hr className="site-guide-divider" />

            <GuideSection icon={<Menu size={15} />} title="Other Controls">
              <ul className="site-guide-action-list">
                {isMobile ? (
                  <GuideActionRow
                    icon={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                      </svg>
                    }
                    label="More"
                    text="Open More from the bottom bar to access your account, notifications, display settings (high contrast, reduced motion), reliability analytics, and app info."
                  />
                ) : (
                  <>
                    <GuideActionRow
                      icon={<Activity size={14} />}
                      label="Source Status"
                      text="View freshness, availability, and normalized ingestion counts for TTC and GO/UP sources without exposing raw payloads."
                    />
                  </>
                )}
                <GuideActionRow icon={<Sun size={14} />} label="Sun / Moon" text="Toggle light and dark map themes." />
                <GuideActionRow icon={<Bus size={14} />} label="Shuttle Badge" text="Appears on alert and closure cards when replacement bus service is active for that disruption." />
                <GuideActionRow icon={<ListFilter size={14} />} label="Filter & Sort Alerts" text="Use the toolbar buttons in alert lists to filter by line and sort by time or severity." />
              </ul>
            </GuideSection>

            <div className="site-guide-note">
              <AlertTriangle size={14} aria-hidden="true" />
              <p>
                LineWatchTO is a personal project, not an official TTC or Metrolinx app. Always verify critical travel decisions with official TTC and GO Transit sources.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );

  if (variant === "chip") {
    return (
      <>
        {!hideTrigger ? <button
          ref={triggerRef}
          type="button"
          className="site-guide-trigger mobile-app-chip-guide"
          suppressHydrationWarning
          aria-controls={panelId}
          aria-expanded={displayedOpen && !isClosing}
          aria-label="Open site guide"
          title="Open site guide"
          data-menu-attention={(!guideSeen && (!displayedOpen || isClosing)) ? "true" : "false"}
          onClick={handleToggle}
        >
          <Image
            src="/assets/linewatch/site-guide.svg"
            alt=""
            aria-hidden="true"
            width={20}
            height={20}
            className="site-guide-trigger-icon"
            priority
          />
        </button> : null}
        {displayedOpen && portalTarget ? createPortal(panelContent, portalTarget) : null}
      </>
    );
  }

  return (
    <div className="site-guide-dropdown relative pointer-events-auto" ref={dropdownRef}>
      {!hideTrigger ? <button
        ref={triggerRef}
        type="button"
        className="site-guide-trigger panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
        suppressHydrationWarning
        aria-controls={panelId}
        aria-expanded={displayedOpen && !isClosing}
        aria-label="Open site guide"
        title="Open site guide"
        data-menu-attention={(!guideSeen && (!displayedOpen || isClosing)) ? "true" : "false"}
        onClick={handleToggle}
      >
        <Image
          src="/assets/linewatch/site-guide.svg"
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          className="site-guide-trigger-icon"
          priority
        />
      </button> : null}

      {panelContent}
    </div>
  );
}
