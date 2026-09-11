"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutList, PanelsTopLeft, Search } from "lucide-react";
import type { ImpactListSort } from "../app/impact-list-controls";
import type { ImpactListView } from "../hooks/useImpactListView";
import { DropdownMenuPortal } from "./DropdownMenuPortal";
import { TransitLineBadge } from "./TransitLineBadge";

type SortOption = {
  value: ImpactListSort;
  label: string;
};

export type ToolbarSelectOption<T extends string> = {
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
  viewMode?: ImpactListView;
  onViewModeChange?: (viewMode: ImpactListView) => void;
};

const LINE_FILTER_DETAILS: Record<string, { number: string; name: string }> = {
  "line-1": { number: "1", name: "Yonge-University" },
  "line-2": { number: "2", name: "Bloor-Danforth" },
  "line-4": { number: "4", name: "Sheppard" },
  "line-5": { number: "5", name: "Eglinton Crosstown" },
  "line-6": { number: "6", name: "Finch West" },
  "regional-br": { number: "BR", name: "Barrie" },
  "regional-ki": { number: "KI", name: "Kitchener" },
  "regional-le": { number: "LE", name: "Lakeshore East" },
  "regional-lw": { number: "LW", name: "Lakeshore West" },
  "regional-mi": { number: "MI", name: "Milton" },
  "regional-rh": { number: "RH", name: "Richmond Hill" },
  "regional-st": { number: "ST", name: "Stouffville" },
  "regional-up": { number: "UP", name: "UP Express" },
  "go-br": { number: "BR", name: "Barrie" },
  "go-ki": { number: "KI", name: "Kitchener" },
  "go-le": { number: "LE", name: "Lakeshore East" },
  "go-lw": { number: "LW", name: "Lakeshore West" },
  "go-mi": { number: "MI", name: "Milton" },
  "go-rh": { number: "RH", name: "Richmond Hill" },
  "go-st": { number: "ST", name: "Stouffville" },
  "up-express": { number: "UP", name: "UP Express" },
};

function lineLabel(lineId: string) {
  const line = LINE_FILTER_DETAILS[lineId];
  if (line) {
    return line.number.length <= 2 && !isNaN(Number(line.number))
      ? `Line ${line.number} ${line.name}`
      : `${line.name} Line`;
  }
  if (lineId.startsWith("regional-")) {
    const code = lineId.replace("regional-", "").toUpperCase();
    return `${code} Line`;
  }
  if (lineId.startsWith("line-")) {
    return `Line ${lineId.replace("line-", "")}`;
  }
  return lineId;
}

function SelectOptionLabel<T extends string>({ option }: { option: ToolbarSelectOption<T> }) {
  if (option.lineId) {
    const line = LINE_FILTER_DETAILS[option.lineId];
    return (
      <span className="flex items-center gap-1.5 min-w-0">
        <TransitLineBadge lineId={option.lineId} lineNumber={line?.number ?? option.lineId} size={18} className="shrink-0" />
        <span className="truncate">{line?.name ?? option.label}</span>
      </span>
    );
  }
  return <span className="truncate">{option.label}</span>;
}

export function ToolbarSelectMenu<T extends string>({
  ariaLabel,
  prefix,
  value,
  options,
  onChange,
  disabled = false,
  align,
}: {
  ariaLabel: string;
  prefix: string;
  value: T;
  options: ToolbarSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const resolvedAlign = align ?? (prefix === "Sort" ? "right" : "left");

  return (
    <div className="impact-list-select-control" ref={menuRef}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        className="saved-commute-sort-trigger impact-list-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
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
      <DropdownMenuPortal
        open={open && !disabled}
        onClose={() => setOpen(false)}
        triggerRef={menuRef}
        align={resolvedAlign}
        role="listbox"
        className="saved-commute-sort-options impact-list-select-options"
      >
        {options.map((option) => {
          const selected = option.value === value;
          const line = option.lineId ? LINE_FILTER_DETAILS[option.lineId] : null;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={
                line
                  ? line.number.length <= 2 && !isNaN(Number(line.number))
                    ? `Line ${line.number} ${line.name}`
                    : `${line.name} Line`
                  : option.label
              }
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
      </DropdownMenuPortal>
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
  viewMode,
  onViewModeChange,
}: Props) {
  const filtering = lineId !== "all" || Boolean(query.trim());
  const lineOptions: ToolbarSelectOption<string>[] = [
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
          className="submenu-search-input"
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
        {viewMode && onViewModeChange ? (
          <ImpactListViewToggle noun={noun} viewMode={viewMode} onViewModeChange={onViewModeChange} />
        ) : null}
      </div>
      <span className="sr-only" role="status">
        {filtering ? `${visibleCount} of ${totalCount}` : `${totalCount} total`}
      </span>
    </div>
  );
}

export function ImpactListViewToggle({ noun, viewMode, onViewModeChange }: {
  noun: string;
  viewMode: ImpactListView;
  onViewModeChange: (view: ImpactListView) => void;
}) {
  return (
    <div className="impact-list-view-toggle" role="group" aria-label={`${noun} view`}>
      <button
        type="button"
        aria-label="Card view"
        aria-pressed={viewMode === "cards"}
        title="Card view"
        onClick={() => onViewModeChange("cards")}
      >
        <PanelsTopLeft size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={viewMode === "list"}
        title="List view"
        onClick={() => onViewModeChange("list")}
      >
        <LayoutList size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
