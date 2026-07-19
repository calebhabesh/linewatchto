"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { ImpactListSort } from "../app/impact-list-controls";

type SortOption = {
  value: ImpactListSort;
  label: string;
};

type SelectOption<T extends string> = {
  value: T;
  label: string;
  lineId?: string;
};

type Props = {
  noun: string;
  totalCount: number;
  visibleCount: number;
  lineIds: string[];
  lineId: string;
  onLineIdChange: (lineId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  sort: ImpactListSort;
  onSortChange: (sort: ImpactListSort) => void;
  sortOptions: SortOption[];
};

const LINE_FILTER_DETAILS: Record<string, { number: string; name: string; icon: string }> = {
  "line-1": { number: "1", name: "Yonge-University", icon: "/assets/linewatch/line-1-legend.svg?v=2" },
  "line-2": { number: "2", name: "Bloor-Danforth", icon: "/assets/linewatch/line-2-legend.svg?v=2" },
  "line-4": { number: "4", name: "Sheppard", icon: "/assets/linewatch/line-4-legend.svg?v=2" },
  "line-5": { number: "5", name: "Eglinton Crosstown", icon: "/assets/linewatch/line-5-legend.svg?v=2" },
  "line-6": { number: "6", name: "Finch West", icon: "/assets/linewatch/line-6-legend.svg?v=2" },
};

function lineLabel(lineId: string) {
  return LINE_FILTER_DETAILS[lineId]?.name ?? `Line ${lineId.replace("line-", "")}`;
}

function SelectOptionLabel({ option }: { option: SelectOption<string> }) {
  const line = option.lineId ? LINE_FILTER_DETAILS[option.lineId] : null;
  return (
    <span className="impact-list-option-label">
      {line ? (
        <Image
          className="impact-list-line-badge"
          src={line.icon}
          alt=""
          width={22}
          height={22}
          aria-hidden="true"
        />
      ) : null}
      <span>{option.label}</span>
    </span>
  );
}

function ToolbarSelectMenu<T extends string>({
  ariaLabel,
  prefix,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  prefix: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="impact-list-select-control" ref={menuRef}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        className="sr-only"
        tabIndex={-1}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        className="saved-commute-sort-trigger impact-list-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="impact-list-control-prefix">{prefix}</span>
        {selectedOption ? <SelectOptionLabel option={selectedOption} /> : <span>{prefix}</span>}
        <ChevronDown
          size={14}
          className="text-slate-400 dark:text-slate-500 shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </button>
      {open ? (
        <div className="saved-commute-sort-options impact-list-select-options" role="listbox">
          {options.map((option) => {
            const selected = option.value === value;
            const line = option.lineId ? LINE_FILTER_DETAILS[option.lineId] : null;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={line ? `Line ${line.number} ${line.name}` : option.label}
                className={`saved-commute-sort-option${selected ? " selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <SelectOptionLabel option={option} />
                {selected ? <Check size={12} className="text-emerald-500 dark:text-emerald-400 shrink-0 ml-2" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ImpactListToolbar({
  noun,
  totalCount,
  visibleCount,
  lineIds,
  lineId,
  onLineIdChange,
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortOptions,
}: Props) {
  const filtering = lineId !== "all" || Boolean(query.trim());
  const lineOptions: SelectOption<string>[] = [
    { value: "all", label: "All Lines" },
    ...lineIds.map((id) => ({ value: id, label: lineLabel(id), lineId: id })),
  ];

  return (
    <div className="impact-list-toolbar" aria-label={`Filter and sort ${noun}`}>
      <label className="impact-list-search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">Filter {noun}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Filter ${noun}...`}
          aria-label={`Filter ${noun}`}
        />
      </label>
      <div className="impact-list-selects">
        <ToolbarSelectMenu
          ariaLabel={`Filter ${noun} by line`}
          prefix="Line"
          value={lineId}
          options={lineOptions}
          onChange={onLineIdChange}
        />
        <ToolbarSelectMenu
          ariaLabel={`Sort ${noun}`}
          prefix="Sort"
          value={sort}
          options={sortOptions}
          onChange={onSortChange}
        />
      </div>
      <span className="sr-only" role="status">
        {filtering ? `${visibleCount} of ${totalCount}` : `${totalCount} total`}
      </span>
    </div>
  );
}
