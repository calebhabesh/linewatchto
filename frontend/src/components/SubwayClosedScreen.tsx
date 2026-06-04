"use client";

import Image from "next/image";
import { BusFront, Clock3, Map, Moon } from "lucide-react";

import { formatResumeDuration, type SubwayOperatingState } from "../app/subway-hours";

export function SubwayClosedScreen({
  operatingState,
  onPeekMap,
}: {
  operatingState: SubwayOperatingState;
  onPeekMap: () => void;
}) {
  const resumeLabel = operatingState.nextResumeLabel ?? "soon";
  const resumeDuration = operatingState.minutesUntilResume === null
    ? null
    : formatResumeDuration(operatingState.minutesUntilResume);

  return (
    <section className="subway-closed-screen" aria-labelledby="subway-closed-title">
      <div className="subway-closed-content">
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
          <p className="subway-closed-kicker">LineWatch TO overnight mode</p>
          <h1 id="subway-closed-title">Subway closed overnight</h1>
          <p>
            Regular subway service is outside operating hours. The feed is hidden for now, but the map
            remains available if you want to check current overlays or station accessibility details.
          </p>
        </div>

        <div className="subway-closed-resume" role="status" aria-live="polite">
          <Clock3 size={22} aria-hidden="true" />
          <span>Service resumes</span>
          <strong>{resumeLabel}</strong>
          {resumeDuration ? <small>in {resumeDuration}</small> : null}
        </div>

        <dl className="subway-closed-hours" aria-label="General TTC subway operating hours">
          <div>
            <dt>Operating hours</dt>
            <dd>{operatingState.operatingHours.weekdaySaturday}</dd>
          </div>
          <div>
            <dt>Sunday start</dt>
            <dd>{operatingState.operatingHours.sunday}</dd>
          </div>
          <div>
            <dt><BusFront size={16} aria-hidden="true" /> Overnight</dt>
            <dd>{operatingState.operatingHours.overnight}</dd>
          </div>
        </dl>

        <p className="subway-closed-caveat">
          {operatingState.operatingHours.caveat}
        </p>

        <div className="subway-closed-actions">
          <button type="button" className="subway-closed-primary-action" onClick={onPeekMap}>
            <Map size={19} aria-hidden="true" />
            Peek at map
          </button>
          <span className="subway-closed-status-note">
            <Moon size={16} aria-hidden="true" />
            Subway lines reopen with regular morning service.
          </span>
        </div>
      </div>
    </section>
  );
}
