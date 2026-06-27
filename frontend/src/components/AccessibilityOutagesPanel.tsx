"use client";

import Image from "next/image";
import React, { useState } from "react";
import { ChevronLeft, X, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { AccessibilityOutageResponse } from "../app/accessibility-outage-data";
import { formatRelativeImpactTime } from "../app/impact-time";

interface Props {
  accessibilityOutageResult: AccessibilityOutageResponse | null;
  onSelectStation: (stationId: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export function AccessibilityOutagesPanel({
  accessibilityOutageResult,
  onSelectStation,
  onBack,
  onClose,
}: Props) {
  const [selectedAssetType, setSelectedAssetType] = useState<"elevator" | "escalator" | null>(null);
  const [expandedStations, setExpandedStations] = useState<Record<string, boolean>>({});

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
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={handleBackClick}
            className="p-1 sm:p-2 -ml-1 sm:-ml-3 mr-0 sm:mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <Image
                src="/assets/linewatch/accessibility-alert.svg"
                alt=""
                width={24}
                height={24}
                className="w-5 h-5 sm:w-6 sm:h-6 shrink-0"
              />
              <h2 className="text-[clamp(14px,4.5cqw,18px)] font-bold text-slate-900 dark:text-white whitespace-nowrap">
                {selectedAssetType === "elevator"
                  ? "Elevator Outages"
                  : selectedAssetType === "escalator"
                  ? "Escalator Outages"
                  : "Accessibility Outages"}
              </h2>
            </div>
            {accessibilityOutageResult?.source && (
              <span className="text-[9px] sm:hidden text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
                {accessibilityOutageResult.source}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {accessibilityOutageResult?.source && (
            <span className="hidden sm:inline text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
              {accessibilityOutageResult.source}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto min-w-0 p-3 sm:p-4 accessibility-outages-scroll">
        {!selectedAssetType ? (
          /* First View: Asset List */
          <div className="flex flex-col gap-4">
            {/* Elevator Entry */}
            <button
              onClick={() => setSelectedAssetType("elevator")}
              className="w-full text-left p-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-[#12151c] dark:hover:bg-[#181d26] transition-all flex flex-col gap-3 group relative cursor-pointer"
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
                      TTC subway & LRT stations
                    </p>
                  </div>
                </div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500/20 px-2 text-xs font-black text-amber-700 dark:text-amber-400">
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
                      <Image
                        src={`/assets/linewatch/${line.lineId}-legend.svg?v=2`}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5 shrink-0 select-none"
                      />
                      <span>
                        {line.lineName}: {line.count} {line.count === 1 ? "outage" : "outages"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No active TTC elevator outages linked to mapped stations.
                </p>
              )}
            </button>

            {/* Escalator Entry */}
            <button
              onClick={() => setSelectedAssetType("escalator")}
              className="w-full text-left p-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-[#12151c] dark:hover:bg-[#181d26] transition-all flex flex-col gap-3 group relative cursor-pointer"
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
                      TTC subway & LRT stations
                    </p>
                  </div>
                </div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500/20 px-2 text-xs font-black text-amber-700 dark:text-amber-400">
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
                      <Image
                        src={`/assets/linewatch/${line.lineId}-legend.svg?v=2`}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5 shrink-0 select-none"
                      />
                      <span>
                        {line.lineName}: {line.count} {line.count === 1 ? "outage" : "outages"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No active TTC escalator outages linked to mapped stations.
                </p>
              )}
            </button>
          </div>
        ) : (
          /* Second View: Drill-down grouped by line and station */
          <div className="flex flex-col gap-4">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                No active TTC {selectedAssetType} outages linked to mapped stations.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.lineId}
                  className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden"
                >
                  {/* Line Header */}
                  <div
                    className="px-3 py-2 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-[#161a23] border-b border-black/10 dark:border-white/10 text-sm border-l-4"
                    style={{ borderLeftColor: group.color }}
                  >
                    <Image
                      src={`/assets/linewatch/${group.lineId}-legend.svg?v=2`}
                      alt=""
                      width={20}
                      height={20}
                      className="w-5 h-5 shrink-0 select-none"
                    />
                    <span>{group.lineName} Line</span>
                  </div>

                  {/* Stations Accordeon */}
                  <div className="divide-y divide-black/10 dark:divide-white/10 bg-slate-50/50 dark:bg-[#0c0f14]">
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
                            {expanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </button>

                          {/* Station Expanded Outages */}
                          {expanded && (
                            <div
                              id={`outages-list-${expandedKey}`}
                              className="px-3 pt-3 pb-3 flex flex-col gap-2 bg-slate-100/50 dark:bg-[#11151d] border-t border-black/5 dark:border-white/5"
                            >
                              {/* Outage Cards */}
                              {station.outages.map((outage) => (
                                <div
                                  key={outage.id}
                                  className="p-3 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-[#161a23] border-l-4"
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
                                    {outage.cause && (
                                      <div>
                                        <span className="font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">
                                          Cause:
                                        </span>
                                        {outage.cause}
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">
                                        Updated:
                                      </span>
                                      {formatRelativeImpactTime(outage.updatedAt)}
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
                          )}
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
