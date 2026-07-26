"use client";

import Image from "next/image";
import { BusFront, Clock3, Info, Map } from "lucide-react";

import { formatResumeDuration, type SubwayOperatingState } from "../app/subway-hours";

export function SubwayClosedScreen({
  operatingState,
  isExiting,
  onPeekMap,
  onExitComplete,
}: {
  operatingState: SubwayOperatingState;
  isExiting: boolean;
  onPeekMap: () => void;
  onExitComplete: () => void;
}) {
  const resumeLabel = operatingState.nextResumeLabel ?? "soon";
  const resumeDuration = operatingState.minutesUntilResume === null
    ? null
    : formatResumeDuration(operatingState.minutesUntilResume);

  return (
    <>
      <div
        className={`subway-closed-backdrop ${isExiting ? "subway-closed-backdrop--exiting" : ""}`}
        onClick={onPeekMap}
      />
      <section
        className="subway-closed-screen"
        aria-labelledby="subway-closed-title"
        onAnimationEnd={(event) => {
          if (
            isExiting
            && event.target === event.currentTarget.firstElementChild
            && event.animationName === "subway-closed-modal-exit"
          ) {
            onExitComplete();
          }
        }}
      >
        <div className={`subway-closed-content ${isExiting ? "subway-closed-content--exiting" : ""}`}>
          <div className="subway-closed-icon-shell" aria-hidden="true">
            <Image
              src="/assets/linewatch/closed-alert.svg"
              alt=""
              width={112}
              height={112}
              priority
            />
          </div>

          <div className="subway-closed-copy">
            <h1 id="subway-closed-title">Subway Closed</h1>
            <p>
              Live updates are paused,
              but you can still view the map to check transit lines and station accessibility.
            </p>
          </div>

          <div className="subway-closed-resume" role="status" aria-live="polite">
            <Clock3 size={24} aria-hidden="true" />
            {resumeDuration ? (
              <>
                <span className="subway-closed-resume-prefix">Service resumes in</span>
                <strong className="subway-closed-resume-countdown">{resumeDuration}</strong>
                <small className="subway-closed-resume-details">{resumeLabel}</small>
              </>
            ) : (
              <>
                <span className="subway-closed-resume-prefix">Service Resumes</span>
                <strong className="subway-closed-resume-countdown">{resumeLabel}</strong>
              </>
            )}
          </div>

          <div className="subway-closed-schedule-container" aria-label="General TTC subway operating hours">
            <div className="subway-closed-schedule-label">
              Operating Hours
            </div>
            <table className="subway-closed-schedule-table">
              <tbody>
                <tr>
                  <td>Monday – Saturday</td>
                  <td>About 6:00 A.M. – 2:00 A.M.</td>
                </tr>
                <tr>
                  <td>Sunday</td>
                  <td>About 8:00 A.M. – 2:00 A.M.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="subway-closed-overnight-note">
            <BusFront size={16} aria-hidden="true" />
            <span>{operatingState.operatingHours.overnight}</span>
          </div>

          <p className="subway-closed-caveat">
            <Info size={16} aria-hidden="true" />
            <span>
              Exact first and last train times vary by station. Check the{" "}
              <a
                href="https://www.ttc.ca/subway-stations"
                target="_blank"
                rel="noopener noreferrer"
                className="subway-closed-link"
              >
                TTC Station Page
              </a>{" "}
              for a specific stop.
            </span>
          </p>

          <div className="subway-closed-actions">
            <button
              type="button"
              className="subway-closed-primary-action"
              disabled={isExiting}
              onClick={onPeekMap}
            >
              <Map size={20} aria-hidden="true" />
              Peek at Map
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
