import { Fragment } from "react";
import type { PlannedScheduleView } from "../app/planned-advisory-schedule";
import { formatClosureScheduleValue } from "./ImpactCardFields";

/** Ranges show an en dash; screen readers, which may say "dash" or nothing, hear "through". */
function SpokenRange({ value }: { value: string }) {
  const parts = value.split(" – ");
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <> <span aria-hidden="true">–</span><span className="sr-only">through</span> </> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** A planned advisory's schedule: its series (when there is one) and its current or next window. */
export function PlannedAdvisorySchedule({ schedule }: { schedule: PlannedScheduleView }) {
  return (
    <section className="planned-schedule" aria-label={schedule.heading}>
      <h4 className="planned-schedule-heading">{schedule.heading}</h4>
      <dl className="planned-schedule-rows">
        {schedule.rows.map((row) => (
          <div key={row.label} className="planned-schedule-row">
            <dt>{row.label}</dt>
            <dd><SpokenRange value={row.moment ? row.value : formatClosureScheduleValue(row.value)} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
