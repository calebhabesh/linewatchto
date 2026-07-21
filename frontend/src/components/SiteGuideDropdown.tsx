"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Apple,
  Bus,
  Download,
  Info,
  Map as MapIcon,
  Menu,
  MousePointer2,
  MoreHorizontal,
  MoreVertical,
  Search,
  Smartphone,
  SquarePlus,
  Sun,
  X,
  ListFilter,
} from "lucide-react";
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
      <span className={`text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5 ${labelClassName}`}>
        {label}
      </span>
    </div>
  );
}

export function SiteGuideDropdown({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        panelRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange]);

  return (
    <div className="site-guide-dropdown relative pointer-events-auto" ref={dropdownRef}>
      <button
        type="button"
        className="site-guide-trigger panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="Open site guide"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          onOpenChange?.(next);
        }}
      >
        <Image
          src="/assets/linewatch/site-guide.svg"
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          className="site-guide-trigger-icon"
          priority
        />
      </button>

      {isOpen ? (
        <section
          ref={panelRef}
          tabIndex={-1}
          id={panelId}
          className="site-guide-panel outline-none"
          role="dialog"
          aria-label="LineWatchTO site guide"
        >
          <div className="site-guide-header">
            <div className="site-guide-title">
              <Info size={18} aria-hidden="true" />
              <div>
                <h2>LineWatchTO Guide</h2>
                <p>Unofficial TTC subway and LRT reliability dashboard.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenChange?.(false);
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
                  src="/assets/linewatch/transportation-train.svg"
                  alt=""
                  aria-hidden="true"
                  width={15}
                  height={15}
                  className="dark:invert high-contrast:invert shrink-0"
                />
              }
              title="What LineWatchTO Does"
            >
              <p>
                LineWatchTO shows TTC subway/LRT alerts, delays, reduced speed zones, planned closures, station details, and saved commute impacts. It displays live backend updates when ingestion is running, and falls back to demo fixtures otherwise.
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

            <GuideSection icon={<MousePointer2 size={15} />} title="How to Use LineWatchTO">
              <ul className="site-guide-action-list">
                <GuideActionRow icon={<MousePointer2 size={14} />} label="Drag The Map" text="Pan to navigate the network. Scroll or pinch to zoom." />
                <GuideActionRow
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M7 7L5.5 5.5M15 7L16.5 5.5M5.5 16.5L7 15M11 5L11 3M5 11L3 11M17.1603 16.9887L21.0519 15.4659C21.4758 15.3001 21.4756 14.7003 21.0517 14.5346L11.6992 10.8799C11.2933 10.7213 10.8929 11.1217 11.0515 11.5276L14.7062 20.8801C14.8719 21.304 15.4717 21.3042 15.6375 20.8803L17.1603 16.9887Z" />
                    </svg>
                  }
                  label="Click a Colored Overlay"
                  text="Tap any line overlay to view its active alert or closure card."
                />
                <GuideActionRow icon={<MapIcon size={14} />} label="Click a Station" text="Tap a station dot to view accessibility status, alerts, arrivals, or to select it for a saved commute." />
                <GuideActionRow icon={<Search size={14} />} label="Station & Alert Search" text="Use the search icon on the left to quickly jump to any station or find active alerts." />
                {!isMobile && (
                  <GuideActionRow icon={<Menu size={14} />} label="Main Menu" text="Use the menu icon at the top left to create an account and access lists, commutes, analytics, contrast, and motion controls." />
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
                  title="Planned Closure Preview"
                  text="Static, translucent blue lane previews scheduled upcoming closures (usually bidirectional)."
                  previews={
                    <OverlayAssetPreview fileName="info-upcoming-closure.svg" label="Preview" />
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
                    icon={<MoreHorizontal size={14} />}
                    label="More Options"
                    text="Access high contrast, reduced motion, account settings, and reliability analytics."
                  />
                ) : (
                  <>
                    <GuideActionRow
                      icon={
                        <svg viewBox="0 0 32 32" fill="currentColor" className="w-3.5 h-3.5">
                          <rect x="10" y="18" width="8" height="2" />
                          <rect x="10" y="13" width="12" height="2" />
                          <rect x="10" y="23" width="5" height="2" />
                          <path d="M25,5H22V4a2,2,0,0,0-2-2H12a2,2,0,0,0-2,2V5H7A2,2,0,0,0,5,7V28a2,2,0,0,0,2,2H25a2,2,0,0,0,2-2V7A2,2,0,0,0,25,5ZM12,4h8V8H12ZM25,28H7V7h3v3H22V7h3Z" />
                        </svg>
                      }
                      label="Ingested TTC Alerts"
                      text="View the raw alert feed used to inspect backend ingestion."
                    />
                  </>
                )}
                <GuideActionRow icon={<Sun size={14} />} label="Sun / Moon" text="Toggle light and dark map themes." />
                <GuideActionRow icon={<Bus size={14} />} label="Shuttle Badge" text="Blue badge indicates replacement bus service is active." />
                <GuideActionRow icon={<ListFilter size={14} />} label="Filter & Sort Alerts" text="Use the toolbar buttons in alert lists to filter by line and sort by time or severity." />
              </ul>
            </GuideSection>

            <div className="site-guide-note">
              <AlertTriangle size={14} aria-hidden="true" />
              <p>
                LineWatchTO is a personal project, not an official TTC app. Always verify critical travel decisions with TTC sources.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
