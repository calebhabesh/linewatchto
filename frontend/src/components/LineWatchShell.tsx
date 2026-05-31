"use client";

import { useState, useEffect } from "react";
import { DynamicBackground } from "./DynamicBackground";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { LineStatusPanel } from "./LineStatusPanel";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { SavedCommutesPanel } from "./SavedCommutesPanel";
import { ReliabilityPanel, IngestionHealthPanel } from "./ReliabilityPanel";
import { LineLegend } from "./LineLegend";
import { generatedAt, activeAlerts } from "../app/linewatch-data";
import { Menu, X } from "lucide-react";

export function LineWatchShell() {
  const [isDark, setIsDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Interactive linking state
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);

  // Check system preference for reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.resolve().then(() => setReducedMotion(mediaQuery.matches));
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return (
    <div className={`relative w-full h-screen overflow-hidden transition-colors duration-500 ${isDark ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {/* Background */}
      <DynamicBackground reducedMotion={reducedMotion} isDark={isDark} />
      
      {/* Top Floating Header Controls */}
      <header className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-start pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Menu Drawer Toggle Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-white/80 dark:bg-[#12151c]/80 border border-black/10 dark:border-white/10 backdrop-blur-md shadow-lg text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1b1f2b] transition-all cursor-pointer"
            aria-label="Open status menu"
          >
            <Menu size={22} />
            {activeAlerts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-md border border-white dark:border-[#12151c]">
                {activeAlerts.length}
              </span>
            )}
          </button>
          
          {/* Branding Block */}
          <div className="flex items-center gap-4 bg-white/80 dark:bg-[#12151c]/80 p-3 pr-6 rounded-2xl border border-black/10 dark:border-white/10 backdrop-blur-md shadow-lg">
            <div className="flex items-center justify-center w-10 h-10 bg-red-600 font-black text-white rounded-xl shadow-inner tracking-tighter text-lg border border-red-500">
              LW
            </div>
            <div className="flex flex-col">
              <h1 className="text-slate-900 dark:text-white font-bold leading-tight tracking-wide">LineWatch TO</h1>
              <span className="text-slate-500 dark:text-white/50 text-xs font-semibold uppercase tracking-widest">Network Status</span>
            </div>
          </div>
        </div>

        {/* Floating Time Capsule (Top Center) */}
        <div className="hidden sm:flex absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="bg-white/80 dark:bg-[#12151c]/80 border border-black/10 dark:border-white/10 backdrop-blur-md shadow-lg rounded-2xl px-5 py-2.5 flex items-center gap-3">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Last poll:</span>
            <strong className="text-sm font-bold text-slate-800 dark:text-white">{generatedAt.lastPoll}</strong>
            <span className="h-4 w-px bg-slate-300 dark:bg-white/10" />
            <b className="text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 px-2.5 py-0.5 rounded-full border border-green-500/20">
              Live status
            </b>
          </div>
        </div>
        
        {/* Balanced spacer for flex alignment since controls are now embedded in map */}
        <div className="w-12 h-12" />
      </header>

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      <main className="absolute inset-0 z-10">
        <InteractiveTtcMap 
          selectedAlertId={selectedAlertId}
          selectedClosureId={selectedClosureId}
          onSelectAlertId={setSelectedAlertId}
          onSelectClosureId={setSelectedClosureId}
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
        />
      </main>

      {/* Fixed borderless legend at the bottom right */}
      <aside className="fixed bottom-6 right-6 z-20 pointer-events-none">
        <LineLegend />
      </aside>

      {/* Backdrop overlay for active drawer */}
      {drawerOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 pointer-events-auto transition-opacity duration-300"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side Menu Drawer (Left Side Slide-out) */}
      <aside 
        className={`fixed top-0 left-0 bottom-0 z-40 w-full max-w-[420px] bg-[#f8fafc]/95 dark:bg-[#0a0c10]/95 backdrop-blur-xl border-r border-black/10 dark:border-white/10 shadow-2xl p-6 transition-transform duration-300 transform overflow-y-auto flex flex-col gap-6 pointer-events-auto ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-red-600 font-black text-white rounded-lg shadow-inner tracking-tighter text-sm border border-red-500">
              LW
            </div>
            <strong className="text-slate-900 dark:text-white font-bold tracking-wide">Transit Operations</strong>
          </div>
          <button 
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Panel content */}
        <div className="flex flex-col gap-5 pr-1 pb-4">
          <LineStatusPanel />
          <ActiveAlertsPanel 
            selectedAlertId={selectedAlertId}
            onSelectAlertId={(id) => {
              setSelectedAlertId(id);
            }}
          />
          <PlannedClosuresPanel 
            selectedClosureId={selectedClosureId}
            onSelectClosureId={(id) => {
              setSelectedClosureId(id);
            }}
          />
          <SavedCommutesPanel />
          <ReliabilityPanel />
          <IngestionHealthPanel />
        </div>
      </aside>
    </div>
  );
}
