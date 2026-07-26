"use client";

import Image from "next/image";
import { BusFront, Clock3, Info, Map } from "lucide-react";

import type { RegionalRailOperatingState } from "../app/regional-rail-hours";
import { formatResumeDuration } from "../app/subway-hours";

export function GoUpClosedScreen({
  operatingState,
  isExiting,
  onPeekMap,
  onExitComplete,
}: {
  operatingState: RegionalRailOperatingState;
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
        className="subway-closed-screen go-up-closed-screen"
        aria-labelledby="go-up-closed-title"
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
        <div
          className={`subway-closed-content go-up-closed-content ${
            isExiting ? "subway-closed-content--exiting" : ""
          }`}
        >
          <div className="subway-closed-icon-shell" aria-hidden="true">
            <Image
              src="/assets/linewatch/closed-alert.svg"
              alt=""
              width={96}
              height={96}
              priority
            />
          </div>

          <div className="subway-closed-copy">
            <h1 id="go-up-closed-title">GO &amp; UP Rail Closed</h1>
            <p>
              Regular passenger rail is outside the broad overnight operating window.
              You can still inspect the regional map and available service notices.
            </p>
          </div>

          <div className="subway-closed-resume go-up-closed-resume" role="status" aria-live="polite">
            <Clock3 size={24} aria-hidden="true" />
            {resumeDuration ? (
              <>
                <span className="subway-closed-resume-prefix">Broad rail service begins returning in</span>
                <strong className="subway-closed-resume-countdown">{resumeDuration}</strong>
                <small className="subway-closed-resume-details">{resumeLabel}</small>
              </>
            ) : (
              <>
                <span className="subway-closed-resume-prefix">Broad rail service begins returning</span>
                <strong className="subway-closed-resume-countdown">{resumeLabel}</strong>
              </>
            )}
          </div>

          <div
            className="subway-closed-schedule-container go-up-closed-schedule-container"
            aria-label="General GO and UP regional rail service patterns"
          >
            <div className="subway-closed-schedule-label">Service Patterns</div>
            <table className="subway-closed-schedule-table go-up-closed-schedule-table">
              <tbody>
                <tr>
                  <td>UP Express</td>
                  <td>Union: 4:55 A.M. weekdays / 6:00 A.M. weekends – 1:00 A.M.</td>
                </tr>
                <tr>
                  <td>GO All-Day Rail</td>
                  <td>Hours vary by corridor, direction, and day</td>
                </tr>
                <tr>
                  <td>Weekday Peak Rail</td>
                  <td>Milton and Richmond Hill</td>
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
              {operatingState.operatingHours.caveat} Rail and bus schedules change frequently.
              Check the{" "}
              <a
                href="https://www.gotransit.com/en/see-schedules"
                target="_blank"
                rel="noopener noreferrer"
                className="subway-closed-link"
              >
                GO Schedules
              </a>{" "}
              or{" "}
              <a
                href="https://www.gotransit.com/en/see-schedules/pdf-schedules"
                target="_blank"
                rel="noopener noreferrer"
                className="subway-closed-link"
              >
                GO PDF Schedules
              </a>, and the{" "}
              <a
                href="https://www.upexpress.com/en/up-express-stations/union-station/departures-and-schedules"
                target="_blank"
                rel="noopener noreferrer"
                className="subway-closed-link"
              >
                UP Express Schedules
              </a>{" "}
              before travelling. GO notes that PDFs may not be the most recent.
            </span>
          </p>

          <div className="subway-closed-actions">
            <button
              type="button"
              className="subway-closed-primary-action go-up-closed-primary-action"
              disabled={isExiting}
              onClick={onPeekMap}
            >
              <Map size={20} aria-hidden="true" />
              Peek at Regional Map
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
