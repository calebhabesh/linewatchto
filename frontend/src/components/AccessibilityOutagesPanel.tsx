"use client";

import Image from "next/image";
import React, { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { AccessibilityOutageResponse } from "../app/accessibility-outage-data";
import { formatImpactTimestamp } from "../app/impact-time";
import { suppliedAlertCause } from "../app/alert-cause";
import { regionalLineLabel, type NetworkId } from "../app/regional-data";

interface Props {
  accessibilityOutageResult: AccessibilityOutageResponse | null;
  initialTarget?: AccessibilityOutageTarget | null;
  onSelectStation: (stationId: string) => void;
  onBack: () => void;
  onClose: () => void;
  networkId?: NetworkId;
}

export type AccessibilityOutageTarget = {
  assetType: "elevator" | "escalator";
  stationId: string;
};

function initiallyExpandedStations(
  accessibilityOutageResult: AccessibilityOutageResponse | null,
  initialTarget: AccessibilityOutageTarget | null,
) {
  if (!initialTarget) return {};

  return Object.fromEntries(
    (accessibilityOutageResult?.groups ?? [])
      .filter((group) => group.stations.some((station) => station.stationId === initialTarget.stationId))
      .map((group) => [`${group.lineId}-${initialTarget.stationId}`, true]),
  );
}

export function AccessibilityOutagesPanel({
  accessibilityOutageResult,
  initialTarget = null,
  onSelectStation,
  onBack,
  onClose,
  networkId = "ttc",
}: Props) {
  const [selectedAssetType, setSelectedAssetType] = useState<"elevator" | "escalator" | null>(initialTarget?.assetType ?? null);
  const [navDirection, setNavDirection] = useState<"forward" | "back" | null>(null);
  const [expandedStations, setExpandedStations] = useState<Record<string, boolean>>(
    () => initiallyExpandedStations(accessibilityOutageResult, initialTarget),
  );
  const enteredAtInitialTarget = React.useRef(Boolean(initialTarget));
  const regional = networkId === "regional";
  const stationScopeLabel = regional ? "GO and UP rail stations" : "TTC subway & LRT stations";
  const emptySourceLabel = regional ? "Metrolinx" : "TTC";

  const lineBadge = (line: { lineId: string; lineNumber: string; lineName: string; color: string }) => regional ? (
    <span
      aria-hidden="true"
      className="inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded px-1 text-[9px] font-black text-white"
      style={{ backgroundColor: line.color }}
    >
      {line.lineNumber}
    </span>
  ) : (
    <Image
      src={`/assets/linewatch/${line.lineId}-legend.svg?v=2`}
      alt=""
      width={20}
      height={20}
      className="w-5 h-5 shrink-0 select-none"
    />
  );

  const toggleStation = (lineId: string, stationId: string) => {
    const key = `${lineId}-${stationId}`;
    setExpandedStations((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const elevatorSummary = accessibilityOutageResult?.assetTypes.find(
    (a) => a.assetType === "elevator"
  );
  const escalatorSummary = accessibilityOutageResult?.assetTypes.find(
    (a) => a.assetType === "escalator"
  );

  const handleBackClick = () => {
    if (selectedAssetType) {
      if (enteredAtInitialTarget.current) {
        onBack();
        return;
      }
      setNavDirection("back");
      setSelectedAssetType(null);
    } else {
      onBack();
    }
  };

  // Filter groups to only show the selected asset type
  const filteredGroups = selectedAssetType
    ? (accessibilityOutageResult?.groups || [])
        .map((group) => {
          const stations = group.stations
            .map((station) => {
              const outages = station.outages.filter(
                (o) => o.assetType === selectedAssetType
              );
              return { ...station, outages, count: outages.length };
            })
            .filter((station) => station.outages.length > 0);
          return { ...group, stations };
        })
        .filter((group) => group.stations.length > 0)
    : [];

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl flex flex-col h-full bg-white dark:bg-[#0a0c10]">
      {/* Panel Header */}
      <PanelHeader
        title={
          selectedAssetType === "elevator"
            ? "Elevator Outages"
            : selectedAssetType === "escalator"
            ? "Escalator Outages"
            : "Accessibility Outages"
        }
        titleCompact
        icon={
          <Image
            src={
              selectedAssetType === "elevator"
                ? "/assets/linewatch/outages/elevator.svg"
                : selectedAssetType === "escalator"
                ? "/assets/linewatch/outages/escalator.svg"
                : "/assets/linewatch/accessibility-alert.svg"
            }
            alt=""
            width={22}
            height={22}
            className="w-5 h-5 shrink-0"
          />
        }
        onBack={handleBackClick}
        onClose={onClose}
        metadata={
          <>
            <span className="panel-header-badge accessibility-count-badge shrink-0">
              {(() => {
                const count = selectedAssetType === "elevator"
                  ? (elevatorSummary?.count ?? 0)
                  : selectedAssetType === "escalator"
                  ? (escalatorSummary?.count ?? 0)
                  : ((elevatorSummary?.count ?? 0) + (escalatorSummary?.count ?? 0));
                return `${count} ${count === 1 ? "Outage" : "Outages"}`;
              })()}
            </span>
            {accessibilityOutageResult?.source ? (
              <span className="card-source text-xs uppercase tracking-wider font-semibold whitespace-nowrap">
                {accessibilityOutageResult.source}
              </span>
            ) : null}
          </>
        }
      />

      {/* Panel Content */}
      <div key={selectedAssetType || "all"} className="flex-1 overflow-y-auto min-w-0 p-3 sm:p-4 accessibility-outages-scroll" data-nav-direction={navDirection || undefined}>
        {!selectedAssetType ? (
          /* First View: Asset List */
          <div className="flex flex-col gap-4">
            {/* Elevator Entry */}
            <button
              onClick={() => {
                setNavDirection("forward");
                setSelectedAssetType("elevator");
              }}
              className="w-full text-left p-3.5 rounded-lg border border-transparent bg-slate-50 hover:bg-slate-100 dark:bg-[#12151c] dark:hover:bg-[#181d26] shadow-xs transition-all flex flex-col gap-3 group relative cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Image
                    src="/assets/linewatch/outages/elevator.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="w-8 h-8 shrink-0 select-none"
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                      Elevator Outages
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {stationScopeLabel}
                    </p>
                  </div>
                </div>
                <span
                  className={`desktop-menu-count-badge ${
                    (elevatorSummary?.count ?? 0) > 0 ? "desktop-menu-count-delays" : "desktop-menu-count-slate"
                  } flex h-7 ${
                    (elevatorSummary?.count ?? 0) < 10 ? "w-7" : "min-w-[28px] px-2"
                  } shrink-0 items-center justify-center rounded-full text-xs font-black`}
                >
                  {elevatorSummary?.count ?? 0}
                </span>
              </div>

              {elevatorSummary && elevatorSummary.lines.length > 0 ? (
                <div className="flex flex-col gap-2 mt-2">
                  {elevatorSummary.lines.map((line) => (
                    <span
                      key={line.lineId}
                      className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                    >
                      {lineBadge(line)}
                      <span>
                        {line.lineName}: {line.count} {line.count === 1 ? "outage" : "outages"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No active {emptySourceLabel} elevator outages linked to mapped stations.
                </p>
              )}
            </button>

            {/* Escalator Entry */}
            <button
              onClick={() => {
                setNavDirection("forward");
                setSelectedAssetType("escalator");
              }}
              className="w-full text-left p-3.5 rounded-lg border border-transparent bg-slate-50 hover:bg-slate-100 dark:bg-[#12151c] dark:hover:bg-[#181d26] shadow-xs transition-all flex flex-col gap-3 group relative cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Image
                    src="/assets/linewatch/outages/escalator.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="w-8 h-8 shrink-0 select-none"
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                      Escalator Outages
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {stationScopeLabel}
                    </p>
                  </div>
                </div>
                <span
                  className={`desktop-menu-count-badge ${
                    (escalatorSummary?.count ?? 0) > 0 ? "desktop-menu-count-delays" : "desktop-menu-count-slate"
                  } flex h-7 ${
                    (escalatorSummary?.count ?? 0) < 10 ? "w-7" : "min-w-[28px] px-2"
                  } shrink-0 items-center justify-center rounded-full text-xs font-black`}
                >
                  {escalatorSummary?.count ?? 0}
                </span>
              </div>

              {escalatorSummary && escalatorSummary.lines.length > 0 ? (
                <div className="flex flex-col gap-2 mt-2">
                  {escalatorSummary.lines.map((line) => (
                    <span
                      key={line.lineId}
                      className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                    >
                      {lineBadge(line)}
                      <span>
                        {line.lineName}: {line.count} {line.count === 1 ? "outage" : "outages"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No active {emptySourceLabel} escalator outages linked to mapped stations.
                </p>
              )}
            </button>
          </div>
        ) : (
          /* Second View: Drill-down grouped by line and station */
          <div className="flex flex-col gap-4">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                No active {emptySourceLabel} {selectedAssetType} outages linked to mapped stations.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.lineId}
                  className="rounded-lg border border-transparent shadow-xs overflow-hidden"
                >
                  {/* Line Header */}
                  <div
                    className="px-3 py-2 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-[#161a23] border-b border-black/5 dark:border-white/5 text-sm border-l-2"
                    style={{ borderLeftColor: group.color }}
                  >
                    {lineBadge(group)}
                    <span>{regional ? regionalLineLabel(group.lineId) : `${group.lineName} Line`}</span>
                  </div>

                  {/* Stations Accordeon */}
                  <div className="divide-y divide-black/5 dark:divide-white/5 bg-slate-50/50 dark:bg-[#0c0f14]">
                    {group.stations.map((station) => {
                      const expandedKey = `${group.lineId}-${station.stationId}`;
                      const expanded = !!expandedStations[expandedKey];
                      return (
                        <div key={station.stationId} className="flex flex-col">
                          {/* Station Row Header */}
                          <button
                            onClick={() => toggleStation(group.lineId, station.stationId)}
                            aria-expanded={expanded}
                            aria-controls={`outages-list-${expandedKey}`}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-semibold">{station.stationName}</span>
                              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                                ({station.count} {station.count === 1 ? "outage" : "outages"})
                              </span>
                            </span>
                            <ChevronDown
                              className="w-4 h-4 text-slate-500 accessibility-accordion-chevron"
                              data-expanded={expanded ? "true" : "false"}
                            />
                          </button>

                          {/* Station Expanded Outages */}
                          <div
                            id={`outages-list-${expandedKey}`}
                            className="accessibility-accordion-wrapper"
                            data-expanded={expanded ? "true" : "false"}
                          >
                            <div className="overflow-hidden">
                              <div className="px-3 pt-3 pb-3 flex flex-col gap-2 bg-slate-100/50 dark:bg-[#11151d] border-t border-black/5 dark:border-white/5">
                                {/* Outage Cards */}
                                {station.outages.map((outage) => (
                                  <div
                                    key={outage.id}
                                    className="p-3 rounded border border-transparent bg-white dark:bg-[#161a23] border-l-2 shadow-xs"
                                    style={{ borderLeftColor: group.color }}
                                  >
                                    <h4 className="text-xs font-normal text-slate-900 dark:text-white mb-1">
                                      {outage.title}
                                    </h4>
                                    {outage.description && (
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                                        {outage.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                      {suppliedAlertCause(outage.cause) && (
                                        <div>
                                          <span className="font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">
                                            Cause:
                                          </span>
                                          {suppliedAlertCause(outage.cause)}
                                        </div>
                                      )}
                                      <div>
                                        <span className="font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">
                                          Updated:
                                        </span>
                                        {formatImpactTimestamp(outage.updatedAt)}
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* Station Action Button */}
                                <div className="flex justify-end pt-1">
                                  <button
                                    onClick={() => onSelectStation(station.stationId)}
                                    className="inline-flex min-h-[34px] items-center gap-2 rounded-lg bg-blue-600 px-3 text-white transition-colors hover:bg-blue-700 cursor-pointer"
                                  >
                                    <MapPin size={15} />
                                    <span className="text-sm font-bold leading-none">View Station</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
