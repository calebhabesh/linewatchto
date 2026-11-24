"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DAY_OF_WEEK_LABELS } from "../../app/reliability-analytics";
import { addServiceDays, addServiceMonths, calendarMonthDates, clampServiceDate, formatServiceDate } from "../../app/reliability-range";
import { DropdownMenuPortal } from "../DropdownMenuPortal";
import styles from "./analytics.module.css";

const MENU_WIDTH = 296;
const MONTH_FORMAT = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const FULL_FORMAT = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function format(formatter: Intl.DateTimeFormat, date: string) {
  return formatter.format(new Date(`${date}T00:00:00Z`));
}

/** A date from `min` to `max`, picked from a month. Days from `rangeFrom` to `rangeTo` are joined up. */
export function DatePicker({ label, value, min, max, rangeFrom, rangeTo, disabled, onCommit }: {
  label: string;
  value: string;
  min: string | undefined;
  max: string | undefined;
  rangeFrom: string;
  rangeTo: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value);
  const close = useCallback(() => setOpen(false), []);
  const shown = open && !disabled && Boolean(value && min && max);

  useEffect(() => {
    if (!shown || !focusDay.current) return;
    focusDay.current = false;
    // The menu is placed before it is shown, and a hidden day cannot take focus.
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, cursor]);

  function show() {
    focusDay.current = true;
    setCursor(clampServiceDate(value, min ?? value, max ?? value));
    setOpen(true);
  }

  function choose(date: string) {
    setOpen(false);
    triggerRef.current?.focus();
    if (date !== value) onCommit(date);
  }

  function moveTo(date: string, focus: boolean) {
    if (!min || !max) return;
    focusDay.current = focus;
    setCursor(clampServiceDate(date, min, max));
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const weekday = (new Date(`${cursor}T00:00:00Z`).getUTCDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addServiceDays(cursor, -1),
      ArrowRight: () => addServiceDays(cursor, 1),
      ArrowUp: () => addServiceDays(cursor, -7),
      ArrowDown: () => addServiceDays(cursor, 7),
      Home: () => addServiceDays(cursor, -weekday),
      End: () => addServiceDays(cursor, 6 - weekday),
      PageUp: () => addServiceMonths(cursor, -1),
      PageDown: () => addServiceMonths(cursor, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveTo(move(), true);
  }

  function keepTabInside(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const stops = [...dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled):not([tabindex='-1'])") ?? []];
    const edge = event.shiftKey ? stops[0] : stops.at(-1);
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
  }

  const month = cursor.slice(0, 7);
  const days = shown ? calendarMonthDates(cursor) : [];

  return (
    <div className={styles.field}>
      <span id={`${id}-label`} className={styles.fieldLabel}>{label}</span>
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        className={styles.selectTrigger}
        aria-labelledby={`${id}-label ${id}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={shown}
        disabled={disabled}
        onClick={() => shown ? close() : show()}
      >
        <span>{value ? formatServiceDate(value) : "—"}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      <DropdownMenuPortal
        open={shown}
        onClose={close}
        triggerRef={triggerRef}
        minWidth={MENU_WIDTH}
        maxWidth={MENU_WIDTH}
        role="dialog"
        aria-label={`Choose ${label} Date`}
        className={styles.selectMenu}
      >
        <div ref={dialogRef} className={styles.datePicker} onKeyDown={keepTabInside}>
          <div className={styles.datePickerHeading}>
            <button
              type="button"
              aria-label="Previous Month"
              disabled={!min || month <= min.slice(0, 7)}
              onClick={() => moveTo(addServiceMonths(cursor, -1), false)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong id={`${id}-month`} aria-live="polite">{shown ? format(MONTH_FORMAT, cursor) : ""}</strong>
            <button
              type="button"
              aria-label="Next Month"
              disabled={!max || month >= max.slice(0, 7)}
              onClick={() => moveTo(addServiceMonths(cursor, 1), false)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <table role="grid" aria-labelledby={`${id}-month`} onKeyDown={onGridKeyDown}>
            <thead>
              <tr>{DAY_OF_WEEK_LABELS.map((day) => <th key={day} scope="col" abbr={day}>{day[0]}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={week}>
                  {DAY_OF_WEEK_LABELS.map((day, column) => {
                    const date = days[week * 7 + column];
                    if (!date) return <td key={day} />;
                    const inRange = date >= rangeFrom && date <= rangeTo;
                    return (
                      <td
                        key={day}
                        role="gridcell"
                        aria-selected={date === value}
                        data-range={inRange || undefined}
                        data-edge={date === rangeFrom && date === rangeTo ? "both" : date === rangeFrom ? "from" : date === rangeTo ? "to" : undefined}
                      >
                        <button
                          type="button"
                          data-date={date}
                          tabIndex={date === cursor ? 0 : -1}
                          aria-label={`${format(FULL_FORMAT, date)}${date === max ? ", Today" : ""}`}
                          data-today={date === max || undefined}
                          disabled={Boolean(min && date < min || max && date > max)}
                          onClick={() => choose(date)}
                        >
                          {Number(date.slice(8))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DropdownMenuPortal>
    </div>
  );
}
