"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { DynamicBackground } from "./DynamicBackground";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { SavedCommutesPanel } from "./SavedCommutesPanel";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { LineLegend } from "./LineLegend";
import { DataProvider, DashboardData } from "../app/DataContext";
import {
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
  type StationDataResult,
  type StationDetail,
  type StationSummary,
} from "../app/station-data";
import { StationDetailPanel } from "./StationDetailPanel";
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3 } from "lucide-react";

type ActiveView = "map" | "menu" | "alerts" | "closures" | "commutes" | "analytics";

export function LineWatchShell({ initialData }: { initialData: DashboardData }) {
  const { generatedAt, activeAlerts, lineStatuses, ingestionHealth, plannedClosures } = initialData;
  const dataModeLabel = generatedAt.live ? "Live status" : "Demo status";
  const [isDark, setIsDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("map");
  
  // Interactive linking state
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [stationSummaries, setStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [stationResult, setStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.resolve().then(() => setReducedMotion(mediaQuery.matches));
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getStationSummaries().then((result) => {
      if (!cancelled) {
        setStationSummaries(result.data.stations);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!selectedStationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStationResult(null);
      setStationLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setStationLoading(true);
    getStationDetail(selectedStationId).then((result) => {
      if (!cancelled) {
        setStationResult(result);
        setStationLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedStationId]);

  const handleToggleMenu = () => {
    setActiveView(prev => {
      if (prev !== "menu" && prev !== "map") {
        setSelectedAlertId(null);
        setSelectedClosureId(null);
        setSelectedStationId(null);
      }
      return prev === "menu" ? "map" : "menu";
    });
  };

  return (
    <DataProvider data={initialData}>
      <div className={`linewatch-shell relative w-full h-screen overflow-hidden transition-colors duration-500 ${isDark ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {/* Background */}
      <DynamicBackground reducedMotion={reducedMotion} isDark={isDark} />
      
      {/* Top Floating Header Controls */}
      <header className={`absolute top-0 left-0 w-full p-4 sm:p-6 z-40 flex justify-between items-start pointer-events-none`}>
        <div className="flex items-start gap-3 pointer-events-auto relative">
          {/* Menu Toggle Button */}
          <button
            onClick={handleToggleMenu}
            className={`panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer`}
            aria-label={"Toggle menu"}
          >
            <div className="relative w-7 h-7 flex items-center justify-center">
               <Menu 
                  className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} 
                  size={26} 
               />
               <X 
                  className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} 
                  size={26} 
               />
            </div>
            {activeAlerts.length > 0 && activeView !== "menu" && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-md border border-white dark:border-[#12151c]">
                {activeAlerts.length}
              </span>
            )}
          </button>

          {/* Floating Dropdown Menu */}
          <div className={`panel-strong absolute top-[72px] left-0 w-[min(calc(100vw-32px),360px)] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col origin-top-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 -translate-y-4 pointer-events-none"}`}>
               {/* Branding */}
               <div className="flex items-center gap-3 p-4 border-b border-black/10 dark:border-white/10 bg-white/40 dark:bg-black/20">
                 <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg shadow-sm border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 p-1">
                    <Image src="/assets/linewatch/logo.svg" alt="LineWatch TO Logo" width={24} height={24} className="drop-shadow-sm dark:brightness-200" />
                 </div>
                 <strong className="text-slate-900 dark:text-white font-bold tracking-wide">LineWatch TO</strong>
               </div>
               
               {/* Nav Links */}
               <div className="flex flex-col p-2 border-b border-black/10 dark:border-white/10">
                 <button onClick={() => { setActiveView("map"); setSelectedAlertId(null); setSelectedClosureId(null); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
                   <MapIcon size={18} className="text-slate-500 dark:text-slate-400" /> Map
                 </button>
                 <button onClick={() => setActiveView("alerts")} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
                   <div className="flex items-center gap-3">
                     <AlertTriangle size={18} className="text-slate-500 dark:text-slate-400" /> Active Alerts
                   </div>
                   {activeAlerts.length > 0 && (
                     <span className="flex h-5 items-center justify-center rounded-full bg-red-500/20 px-2 text-[10px] font-bold text-red-600 dark:text-red-400">
                       {activeAlerts.length}
                     </span>
                   )}
                 </button>
                 <button onClick={() => setActiveView("closures")} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
                   <div className="flex items-center gap-3">
                     <Calendar size={18} className="text-slate-500 dark:text-slate-400" /> Upcoming Closures
                   </div>
                   {plannedClosures.length > 0 && (
                     <span className="flex h-5 items-center justify-center rounded-full bg-blue-500/20 px-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                       {plannedClosures.length}
                     </span>
                   )}
                 </button>
                 <button onClick={() => setActiveView("commutes")} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
                   <Navigation size={18} className="text-slate-500 dark:text-slate-400" /> Saved Commutes
                 </button>
                 <button onClick={() => setActiveView("analytics")} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
                   <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" /> Reliability Analytics
                 </button>
               </div>

               {/* Toggles */}
               <div className="flex flex-col p-2 border-b border-black/10 dark:border-white/10">
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200">High Contrast Mode</span>
                   <button 
                      onClick={() => setIsDark(!isDark)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${!isDark ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${!isDark ? 'translate-x-4' : 'translate-x-1'}`} />
                   </button>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Reduced Motion</span>
                   <button 
                      onClick={() => setReducedMotion(!reducedMotion)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-1'}`} />
                   </button>
                 </div>
               </div>

               {/* At-A-Glance Integrated Sub-panels */}
               <div className="flex flex-col p-4 gap-4">
                 <div className="flex flex-col gap-2">
                   <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Line Status</span>
                   <div className="flex flex-col gap-2">
                     {lineStatuses.map(l => (
                       <div key={l.id} className="flex items-start gap-3 px-2 py-2 rounded-lg !bg-white dark:!bg-[#12151c] border border-black/5 dark:border-white/5 shadow-sm">
                          <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shadow-sm border border-black dark:border-white/30" style={{ backgroundColor: l.color, color: l.id === "line-1" ? "#000" : "#fff" }}>
                            {l.number}
                          </span>
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                               <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{l.name}</span>
                               {l.status === "suspension" && <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={12}/> Suspended</span>}
                               {l.status === "delay" && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={12}/> Delay</span>}
                               {l.status === "normal" && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Good Service</span>}
                             </div>
                             {(l.status === "suspension" || l.status === "delay") && <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug mt-1">{l.summary}</span>}
                          </div>
                       </div>
                     ))}
                   </div>
                 </div>
                 
                 <div className="flex flex-col mt-2 pt-3 border-t border-black/10 dark:border-white/10">
                   <div className="flex flex-wrap items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-2">
                     <ShieldCheck size={16} />
                     <span className="text-[11px] font-bold uppercase tracking-wider">Ingestion Health (Poll: {generatedAt.lastPoll})</span>
                     <span data-testid="menu-dashboard-data-mode" className="text-[11px] font-bold uppercase tracking-wider">{dataModeLabel}</span>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     {ingestionHealth.map((health, idx) => (
                       <div key={idx} className="flex flex-col !bg-white dark:!bg-[#12151c] p-2 rounded-lg border border-black/5 dark:border-white/5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{health.label}</span>
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-300 leading-tight mt-1">{health.value}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
            </div>
        </div>

        {/* Floating Time Capsule (Top Center) */}
        <div className="hidden sm:flex absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="bg-white dark:bg-[#0a0c10] border border-black/10 dark:border-white/10 shadow-lg rounded-2xl p-1.5 flex items-center gap-3 pr-5 transition-transform hover:scale-105">
            <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-xl shadow-sm border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/10 p-1 ml-0.5">
               <Image src="/assets/linewatch/logo.svg" alt="LineWatch TO Logo" width={24} height={24} className="drop-shadow-sm dark:brightness-200" />
            </div>
            <span className="h-4 w-px bg-slate-300 dark:bg-white/10" />
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Last poll:</span>
            <strong className="text-sm font-bold text-slate-800 dark:text-white">{generatedAt.lastPoll}</strong>
            <span className="h-4 w-px bg-slate-300 dark:bg-white/10" />
            <b data-testid="dashboard-data-mode" className="text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 px-2.5 py-0.5 rounded-full border border-green-500/20">
              {dataModeLabel}
            </b>
          </div>
        </div>
        
        <div className="w-12 h-12" />
      </header>

      {/* Floating Submenus (Alerts, Closures, Commutes, Analytics) */}
      <div className={`absolute top-[88px] sm:top-[104px] left-4 sm:left-6 z-30 w-[min(calc(100vw-32px),540px)] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "alerts" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"}`}>
         <div className="max-h-[85vh] overflow-y-auto pr-1 pb-4 flex flex-col gap-4">
           <ActiveAlertsPanel 
             selectedAlertId={selectedAlertId}
             onSelectAlertId={setSelectedAlertId}
             onBack={() => { setActiveView("menu"); setSelectedAlertId(null); }}
           />
         </div>
      </div>

      <div className={`absolute top-[88px] sm:top-[104px] left-4 sm:left-6 z-30 w-[min(calc(100vw-32px),540px)] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "closures" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"}`}>
         <div className="max-h-[85vh] overflow-y-auto pr-1 pb-4 flex flex-col gap-4">
           <PlannedClosuresPanel 
             selectedClosureId={selectedClosureId}
             onSelectClosureId={setSelectedClosureId}
             onBack={() => { setActiveView("menu"); setSelectedClosureId(null); }}
           />
         </div>
      </div>

      <div className={`absolute top-[88px] sm:top-[104px] left-4 sm:left-6 z-30 w-[min(calc(100vw-32px),540px)] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "commutes" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"}`}>
         <div className="max-h-[85vh] overflow-y-auto pr-1 pb-4 flex flex-col gap-4">
           <SavedCommutesPanel onBack={() => setActiveView("menu")} />
         </div>
      </div>

      <div className={`absolute top-[88px] sm:top-[104px] left-4 sm:left-6 z-30 w-[min(calc(100vw-32px),540px)] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "analytics" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"}`}>
         <div className="max-h-[85vh] overflow-y-auto pr-1 pb-4 flex flex-col gap-4">
           <ReliabilityPanel onBack={() => setActiveView("menu")} />
         </div>
      </div>

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      <main className={`absolute inset-0 z-10`}>
        <InteractiveTtcMap 
          selectedAlertId={selectedAlertId}
          selectedClosureId={selectedClosureId}
          selectedStationId={selectedStationId}
          stations={stationSummaries}
          onSelectAlertId={setSelectedAlertId}
          onSelectClosureId={setSelectedClosureId}
          onSelectStationId={(id) => {
            setSelectedStationId(id);
            setSelectedAlertId(null);
            setSelectedClosureId(null);
          }}
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
          layoutResetSignal={0}
        />
      </main>

      {selectedStationId && (
        <StationDetailPanel
          stationResult={stationResult}
          loading={stationLoading}
          selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
          onClose={() => setSelectedStationId(null)}
        />
      )}



      {/* Fixed borderless legend at the bottom right */}
      <aside className="fixed bottom-6 right-6 z-20 pointer-events-auto">
        <LineLegend 
          onAlertClick={(id) => { setActiveView("alerts"); setSelectedAlertId(id); }} 
          onClosureClick={(id) => { setActiveView("closures"); setSelectedClosureId(id); }}
        />
      </aside>
    </div>
    </DataProvider>
  );
}
