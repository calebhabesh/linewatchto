"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
// Static imports give refreshed captures content-hashed URLs, avoiding stale image caches.
import onboardingDesktopMapGuide from "../../public/assets/linewatch/onboarding/desktop-map-guide.png";
import onboardingDesktopImpactDetails from "../../public/assets/linewatch/onboarding/desktop-impact-details.png";
import onboardingDesktopMyCommutesV3 from "../../public/assets/linewatch/onboarding/desktop-my-commutes-v3.png";
import onboardingDesktopMyStationsV3 from "../../public/assets/linewatch/onboarding/desktop-my-stations-v3.png";
import onboardingMobileMapGuide from "../../public/assets/linewatch/onboarding/mobile-map-guide.png";
import onboardingMobileImpactDetails from "../../public/assets/linewatch/onboarding/mobile-impact-details.png";
import onboardingMobileMyCommutesV3 from "../../public/assets/linewatch/onboarding/mobile-my-commutes-v3.png";
import onboardingMobileMyStationsV3 from "../../public/assets/linewatch/onboarding/mobile-my-stations-v3.png";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export const WELCOME_SEEN_STORAGE_KEY = "linewatch-welcome-seen-v1";
export const DISCLAIMER_ACK_STORAGE_KEY = "linewatch-unofficial-notice-ack-v1";

const DESKTOP_SLIDE_COUNT = 3;
const MOBILE_SLIDE_COUNT = 4;

function hasStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function storeValue(key: string) {
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // The current page can still advance when storage is unavailable.
  }
}

function MapOverlayLegend() {
  return (
    <ul className="opening-welcome-map-legend" aria-label="Live map overlay guide">
      <li>
        <Image
          src="/assets/linewatch/info-map-overlays/1-way-delay.svg"
          alt=""
          aria-hidden="true"
          width={72}
          height={24}
          className="opening-welcome-legend-asset"
        />
        <span>Delay</span>
      </li>
      <li>
        <Image
          src="/assets/linewatch/info-map-overlays/1-way-active-alert.svg"
          alt=""
          aria-hidden="true"
          width={72}
          height={24}
          className="opening-welcome-legend-asset"
        />
        <span>Suspended or Closed</span>
      </li>
      <li>
        <Image
          src="/assets/linewatch/info-map-overlays/1-way-rsz.svg"
          alt=""
          aria-hidden="true"
          width={72}
          height={24}
          className="opening-welcome-legend-asset"
        />
        <span>Reduced Speed Zone</span>
      </li>
      <li>
        <Image
          src="/assets/linewatch/info-map-overlays/info-one-way-closure.svg"
          alt=""
          aria-hidden="true"
          width={72}
          height={24}
          className="opening-welcome-legend-asset"
        />
        <span>Planned Closure</span>
      </li>
      <li>
        <Image
          src="/assets/linewatch/info-map-overlays/station-ring-arrow.svg"
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          className="opening-welcome-legend-asset opening-welcome-legend-asset--station"
        />
        <span>Station or Facility Impact</span>
      </li>
    </ul>
  );
}

function SlideDots({
  activeSlide,
  count,
  onSelect,
}: {
  activeSlide: number;
  count: number;
  onSelect: (slide: number) => void;
}) {
  return (
    <div className="opening-welcome-dots" aria-label="Choose an introduction slide" role="group">
      {Array.from({ length: count }, (_, index) => (
        <button
          type="button"
          className={index === activeSlide ? "opening-welcome-dot opening-welcome-dot--active" : "opening-welcome-dot"}
          aria-label={`Go to slide ${index + 1} of ${count}`}
          aria-current={index === activeSlide ? "step" : undefined}
          key={index}
          onClick={() => onSelect(index)}
        />
      ))}
    </div>
  );
}

function SlideControls({
  activeSlide,
  count,
  onBack,
  onFinish,
  onNext,
  onSelect,
}: {
  activeSlide: number;
  count: number;
  onBack: () => void;
  onFinish: () => void;
  onNext: () => void;
  onSelect: (slide: number) => void;
}) {
  const isLastSlide = activeSlide === count - 1;

  return (
    <div className="opening-welcome-controls">
      <div className="opening-welcome-control-row">
        <button
          type="button"
          className="opening-welcome-secondary-button"
          disabled={activeSlide === 0}
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" size={16} />
          Back
        </button>
        <SlideDots activeSlide={activeSlide} count={count} onSelect={onSelect} />
        <button type="button" className="opening-welcome-skip-button" onClick={onFinish}>
          Skip
        </button>
      </div>
      <button
        type="button"
        className="opening-welcome-primary-button"
        onClick={isLastSlide ? onFinish : onNext}
      >
        {isLastSlide ? "Explore dashboard" : "Next"}
        {!isLastSlide ? <ChevronRight aria-hidden="true" size={17} /> : null}
      </button>
    </div>
  );
}

function useSwipeableCarousel({
  slideCount,
  activeSlide,
  onSelectSlide,
}: {
  slideCount: number;
  activeSlide: number;
  onSelectSlide: (slide: number | ((current: number) => number)) => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const dragOffsetRef = useRef(0);

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null || startYRef.current === null) return;

    const diffX = event.clientX - startXRef.current;
    const diffY = event.clientY - startYRef.current;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
        isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      let offset = diffX;
      if ((activeSlide === 0 && diffX > 0) || (activeSlide === slideCount - 1 && diffX < 0)) {
        offset = diffX * 0.28;
      }
      setDragOffset(offset);
    }
  };

  const handlePointerUpOrCancel = () => {
    if (startXRef.current === null) return;
    setIsDragging(false);

    if (isHorizontalSwipeRef.current) {
      const threshold = 35;
      const currentOffset = dragOffsetRef.current;
      if (currentOffset < -threshold && activeSlide < slideCount - 1) {
        onSelectSlide((current) => Math.min(slideCount - 1, current + 1));
      } else if (currentOffset > threshold && activeSlide > 0) {
        onSelectSlide((current) => Math.max(0, current - 1));
      }
    }

    setDragOffset(0);
    startXRef.current = null;
    startYRef.current = null;
    isHorizontalSwipeRef.current = null;
  };

  return {
    dragOffset,
    isDragging,
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUpOrCancel,
      onPointerCancel: handlePointerUpOrCancel,
    },
  };
}

function useActiveSlideHeight(activeSlide: number, viewportId: string) {
  useLayoutEffect(() => {
    const viewport = document.getElementById(viewportId);
    const activeItem = viewport?.querySelector<HTMLElement>(
      `.opening-welcome-slide-item[data-slide-index="${activeSlide}"]`,
    );
    if (!viewport || !activeItem) return;

    const updateHeight = () => {
      const renderedHeight = activeItem.getBoundingClientRect().height;
      viewport.style.height = `${Math.ceil(Math.max(renderedHeight, activeItem.scrollHeight))}px`;
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(activeItem);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeSlide, viewportId]);
}

export function OpeningDisclaimer({
  onVisibilityChange,
  onOpenCreateAccount,
  onOpenSignIn,
  hideNoticeOnMobile = false,
}: {
  onVisibilityChange?: (visible: boolean) => void;
  onOpenCreateAccount?: () => void;
  onOpenSignIn?: () => void;
  hideNoticeOnMobile?: boolean;
}) {
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomeEntranceReady, setWelcomeEntranceReady] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [isWelcomeExiting, setIsWelcomeExiting] = useState(false);
  const [isNoticeExiting, setIsNoticeExiting] = useState(false);
  const [desktopSlide, setDesktopSlide] = useState(0);
  const [mobileSlide, setMobileSlide] = useState(0);
  useActiveSlideHeight(desktopSlide, "opening-welcome-desktop-viewport");
  useActiveSlideHeight(mobileSlide, "opening-welcome-mobile-viewport");

  const desktopSwipe = useSwipeableCarousel({
    slideCount: DESKTOP_SLIDE_COUNT,
    activeSlide: desktopSlide,
    onSelectSlide: setDesktopSlide,
  });

  const mobileSwipe = useSwipeableCarousel({
    slideCount: MOBILE_SLIDE_COUNT,
    activeSlide: mobileSlide,
    onSelectSlide: setMobileSlide,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;

      const showWelcome = !hasStoredValue(WELCOME_SEEN_STORAGE_KEY);
      setWelcomeVisible(showWelcome);
      setNoticeVisible(!showWelcome && !hasStoredValue(DISCLAIMER_ACK_STORAGE_KEY));
      onVisibilityChange?.(showWelcome);
    });

    return () => {
      cancelled = true;
    };
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!welcomeVisible || isWelcomeExiting) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setWelcomeEntranceReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isWelcomeExiting, welcomeVisible]);

  const finishWelcome = () => {
    storeValue(WELCOME_SEEN_STORAGE_KEY);
    setIsWelcomeExiting(true);
    window.setTimeout(() => {
      setWelcomeVisible(false);
      setNoticeVisible(!hasStoredValue(DISCLAIMER_ACK_STORAGE_KEY));
      onVisibilityChange?.(false);
    }, 220);
  };

  const handleCreateAccountClick = (event: React.MouseEvent) => {
    event.preventDefault();
    finishWelcome();
    onOpenCreateAccount?.();
  };

  const handleSignInClick = (event: React.MouseEvent) => {
    event.preventDefault();
    finishWelcome();
    onOpenSignIn?.();
  };

  const handleWelcomeAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (
      isWelcomeExiting
      && event.target === event.currentTarget
      && event.animationName === "opening-disclaimer-modal-exit"
    ) {
      setWelcomeVisible(false);
      setNoticeVisible(!hasStoredValue(DISCLAIMER_ACK_STORAGE_KEY));
      onVisibilityChange?.(false);
    }
  };

  const dismissNotice = () => {
    storeValue(DISCLAIMER_ACK_STORAGE_KEY);
    setIsNoticeExiting(true);
    window.setTimeout(() => {
      setNoticeVisible(false);
    }, 220);
  };

  const handleNoticeAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (
      isNoticeExiting
      && event.target === event.currentTarget
      && (event.animationName === "opening-unofficial-notice-exit" || event.animationName.includes("exit"))
    ) {
      setNoticeVisible(false);
    }
  };

  return (
    <>
      {welcomeVisible ? (
        <div
          className={`opening-disclaimer-backdrop ${isWelcomeExiting ? "opening-disclaimer-backdrop--exiting" : ""}`}
          role="presentation"
        >
          <section
            aria-label="Welcome to LineWatchTO"
            aria-modal="true"
            className={`opening-disclaimer-panel opening-welcome-panel ${welcomeEntranceReady ? "opening-welcome-panel--entrance-ready" : ""} ${isWelcomeExiting ? "opening-disclaimer-panel--exiting" : ""}`}
            role="dialog"
            onAnimationEnd={handleWelcomeAnimationEnd}
          >
            <div className="linewatch-transit-accent-strip opening-disclaimer-strip" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="opening-disclaimer-content opening-welcome-content">
              <header className="opening-disclaimer-welcome">
                <Image
                  className="opening-disclaimer-logo"
                  src="/assets/linewatch/logo.svg"
                  alt=""
                  width={88}
                  height={88}
                  priority
                />
                <h1>
                  <span className="opening-welcome-intro">Welcome to</span>{" "}
                  <span className="opening-welcome-product-name">
                    <strong className="linewatch-wordmark">LineWatchTO</strong>
                    <span className="opening-welcome-version">v 1.0.0</span>
                  </span>
                </h1>
                <p>Toronto &amp; GTA rapid transit service information, all in one place.</p>
              </header>

              <div className="station-arrival-line-divider opening-welcome-divider" aria-hidden="true" />

              <div className="opening-welcome-carousel opening-welcome-carousel--desktop" aria-label="LineWatchTO introduction">
                <div
                  className={`opening-welcome-carousel-viewport ${desktopSwipe.isDragging ? "opening-welcome-carousel-viewport--dragging" : ""}`}
                  id="opening-welcome-desktop-viewport"
                  {...desktopSwipe.bind}
                >
                  <div
                    className="opening-welcome-slide-wrapper"
                    style={{
                      transform: `translateX(calc(-${desktopSlide * 100}% + ${desktopSwipe.dragOffset}px))`,
                      transition: desktopSwipe.isDragging ? "none" : "transform 380ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <div
                      className={`opening-welcome-slide-item ${desktopSlide === 0 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={desktopSlide !== 0}
                      data-slide-index="0"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-desktop-slide-1">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--wide">
                          <Image src={onboardingDesktopMapGuide} alt="LineWatchTO map with a suspension, delay, Reduced Speed Zone, and station impact" fill sizes="520px" priority draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-desktop-slide-1">Read the Live Map</h2>
                          <p>Colours and patterns show the type of service impact.</p>
                        </div>
                        <MapOverlayLegend />
                      </article>
                    </div>

                    <div
                      className={`opening-welcome-slide-item ${desktopSlide === 1 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={desktopSlide !== 1}
                      data-slide-index="1"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-desktop-slide-2">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--wide">
                          <Image src={onboardingDesktopImpactDetails} alt="A selected Reduced Speed Zone card shown beside its highlighted map segment" fill sizes="520px" draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-desktop-slide-2">Explore an Impact</h2>
                          <p>Click a highlighted segment, station, or alert card to see the affected area and details.</p>
                        </div>
                      </article>
                    </div>

                    <div
                      className={`opening-welcome-slide-item ${desktopSlide === 2 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={desktopSlide !== 2}
                      data-slide-index="2"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-desktop-slide-3">
                        <div className="opening-welcome-personal-grid">
                          <figure>
                            <div className="opening-welcome-portrait-frame">
                              <Image src={onboardingDesktopMyCommutesV3} alt="My Commutes route with current impact and planning-time details" fill sizes="250px" draggable={false} />
                            </div>
                            <figcaption>Your Commutes</figcaption>
                          </figure>
                          <figure>
                            <div className="opening-welcome-portrait-frame">
                              <Image src={onboardingDesktopMyStationsV3} alt="My Stations panel with a saved station and upcoming arrivals" fill sizes="250px" draggable={false} />
                            </div>
                            <figcaption>Your Stations</figcaption>
                          </figure>
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-desktop-slide-3">Make It Yours</h2>
                          <p>
                            Use My Stations to keep arrivals and station impacts for your frequented stations close at hand. My Commutes is designed to monitor routes within the transit systems LineWatchTO covers. It is not a
                            journey planner or wayfinder such as Google Maps.
                          </p>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
                <SlideControls
                  activeSlide={desktopSlide}
                  count={DESKTOP_SLIDE_COUNT}
                  onBack={() => setDesktopSlide((current) => Math.max(0, current - 1))}
                  onFinish={finishWelcome}
                  onNext={() => setDesktopSlide((current) => Math.min(DESKTOP_SLIDE_COUNT - 1, current + 1))}
                  onSelect={setDesktopSlide}
                />
              </div>

              <div className="opening-welcome-carousel opening-welcome-carousel--mobile" aria-label="LineWatchTO introduction">
                <div
                  className={`opening-welcome-carousel-viewport ${mobileSwipe.isDragging ? "opening-welcome-carousel-viewport--dragging" : ""}`}
                  id="opening-welcome-mobile-viewport"
                  {...mobileSwipe.bind}
                >
                  <div
                    className="opening-welcome-slide-wrapper"
                    style={{
                      transform: `translateX(calc(-${mobileSlide * 100}% + ${mobileSwipe.dragOffset}px))`,
                      transition: mobileSwipe.isDragging ? "none" : "transform 380ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <div
                      className={`opening-welcome-slide-item ${mobileSlide === 0 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={mobileSlide !== 0}
                      data-slide-index="0"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-mobile-slide-1">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--mobile">
                          <Image src={onboardingMobileMapGuide} alt="Mobile map showing a delay, Reduced Speed Zone, and station impact" fill sizes="340px" priority draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-mobile-slide-1">Read the Live Map</h2>
                          <p>Colours and patterns show the type of service impact.</p>
                        </div>
                        <MapOverlayLegend />
                      </article>
                    </div>

                    <div
                      className={`opening-welcome-slide-item ${mobileSlide === 1 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={mobileSlide !== 1}
                      data-slide-index="1"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-mobile-slide-2">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--mobile">
                          <Image src={onboardingMobileImpactDetails} alt="Mobile Reduced Speed Zone details for a selected map impact" fill sizes="340px" draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-mobile-slide-2">Tap for Alert Details</h2>
                          <p>Tap a highlighted segment or station to open its alert.</p>
                        </div>
                      </article>
                    </div>

                    <div
                      className={`opening-welcome-slide-item ${mobileSlide === 2 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={mobileSlide !== 2}
                      data-slide-index="2"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-mobile-slide-3">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--mobile">
                          <Image src={onboardingMobileMyCommutesV3} alt="Mobile My Commutes route with a current service impact" fill sizes="340px" draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-mobile-slide-3">Monitor Your Commutes</h2>
                          <p>
                            Monitor disruptions on routes within the transit systems LineWatchTO covers. My Commutes is not a journey
                            planner or wayfinder such as Google Maps.
                          </p>
                        </div>
                      </article>
                    </div>

                    <div
                      className={`opening-welcome-slide-item ${mobileSlide === 3 ? "opening-welcome-slide-item--active" : ""}`}
                      aria-hidden={mobileSlide !== 3}
                      data-slide-index="3"
                    >
                      <article className="opening-welcome-slide" aria-labelledby="opening-mobile-slide-4">
                        <div className="opening-welcome-image-frame opening-welcome-image-frame--mobile">
                          <Image src={onboardingMobileMyStationsV3} alt="Mobile My Stations panel showing a saved station" fill sizes="340px" draggable={false} />
                        </div>
                        <div className="opening-welcome-slide-heading">
                          <h2 id="opening-mobile-slide-4">Watch Your Stations</h2>
                          <p>Keep arrivals and station impacts for your frequented stations close at hand.</p>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
                <SlideControls
                  activeSlide={mobileSlide}
                  count={MOBILE_SLIDE_COUNT}
                  onBack={() => setMobileSlide((current) => Math.max(0, current - 1))}
                  onFinish={finishWelcome}
                  onNext={() => setMobileSlide((current) => Math.min(MOBILE_SLIDE_COUNT - 1, current + 1))}
                  onSelect={setMobileSlide}
                />
              </div>

              <p className="opening-welcome-account-copy">
                <button type="button" className="opening-disclaimer-account-link" onClick={handleCreateAccountClick}>
                  Create a free account
                </button>{" "}
                or{" "}
                <button type="button" className="opening-disclaimer-account-link" onClick={handleSignInClick}>
                  sign in
                </button>{" "}
                to save stations, commutes, and configure push notifications. All features are free.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {noticeVisible ? (
        <aside
          className={`opening-unofficial-notice ${isNoticeExiting ? "opening-unofficial-notice--exiting" : ""} ${hideNoticeOnMobile ? "opening-unofficial-notice--mobile-hidden" : ""}`}
          aria-label="Unofficial dashboard notice"
          role="region"
          onAnimationEnd={handleNoticeAnimationEnd}
        >
          <AlertTriangle aria-hidden="true" size={19} strokeWidth={2.4} />
          <div>
            <strong>Unofficial Personal Project</strong>
            <p>LineWatchTO is not affiliated with, endorsed by, or operated by the TTC or Metrolinx. Information may be delayed or unavailable.</p>
          </div>
          <button type="button" onClick={dismissNotice}>Got it</button>
        </aside>
      ) : null}
    </>
  );
}
