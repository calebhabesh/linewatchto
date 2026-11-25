"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DropdownMenuPortal } from "../DropdownMenuPortal";
import styles from "./analytics.module.css";

export type SelectMenuOption = { value: string; label: string; icon?: ReactNode };

const TYPEAHEAD_RESET_MS = 600;
/** Wide enough for a line's full name when the field is half a phone wide. */
const MIN_MENU_WIDTH = 250;

/** A select with the site's own menu. Focus stays on the trigger; the marked option is its active descendant. */
export function SelectMenu({ label, value, options, disabled = false, onChange }: {
  label: string;
  value: string;
  options: readonly SelectMenuOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuWidth, setMenuWidth] = useState(MIN_MENU_WIDTH);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];
  const close = useCallback(() => setOpen(false), []);
  const shown = open && !disabled;

  useEffect(() => {
    if (shown) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [shown, active, id]);

  function show(index = selectedIndex) {
    setActive(index);
    setMenuWidth(Math.max(MIN_MENU_WIDTH, triggerRef.current?.offsetWidth ?? 0));
    setOpen(true);
  }

  function choose(index: number) {
    setOpen(false);
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
  }

  /** The next option starting with what was typed, or with the letter again when it repeats. */
  function typeTo(key: string, from: number) {
    const now = Date.now();
    const text = (now - typed.current.at > TYPEAHEAD_RESET_MS ? "" : typed.current.text) + key.toLowerCase();
    typed.current = { text, at: now };
    const repeated = [...text].every((letter) => letter === text[0]);
    const search = repeated ? text[0] : text;
    for (let step = repeated ? 1 : 0; step <= options.length; step += 1) {
      const index = (from + step) % options.length;
      if (options[index].label.toLowerCase().startsWith(search)) return index;
    }
    return null;
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = options.length - 1;
    const { key } = event;
    if (key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey && key !== "ArrowDown" && key !== "ArrowUp") return;
    if (!shown) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        show();
      } else if (key.length === 1) {
        const index = typeTo(key, selectedIndex);
        if (index !== null) show(index);
      }
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      PageDown: Math.min(last, active + 8),
      PageUp: Math.max(0, active - 8),
      Home: 0,
      End: last,
    };
    if (key in moves) {
      event.preventDefault();
      setActive(moves[key]);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(active);
    } else if (key.length === 1) {
      const index = typeTo(key, active);
      if (index !== null) setActive(index);
    }
  }

  return (
    <div className={styles.field}>
      <span id={`${id}-label`} className={styles.fieldLabel}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={styles.selectTrigger}
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-activedescendant={shown ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => shown ? close() : show()}
        onKeyDown={onKeyDown}
      >
        {selected?.icon}
        <span>{selected?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <DropdownMenuPortal
        open={shown}
        onClose={close}
        triggerRef={triggerRef}
        minWidth={menuWidth}
        maxWidth={menuWidth}
        maxHeight={360}
        role="listbox"
        id={`${id}-list`}
        aria-labelledby={`${id}-label`}
        className={styles.selectMenu}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === selectedIndex}
            data-active={index === active || undefined}
            className={styles.selectOption}
            // Keeps focus on the trigger, so its keys go on working.
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => setActive(index)}
            onClick={() => choose(index)}
          >
            {option.icon}
            <span>{option.label}</span>
            {index === selectedIndex ? <Check size={15} aria-hidden="true" /> : null}
          </div>
        ))}
      </DropdownMenuPortal>
    </div>
  );
}
