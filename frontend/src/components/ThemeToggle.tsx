"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ 
  isDark, 
  onToggle 
}: { 
  isDark: boolean; 
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="relative flex items-center justify-center w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 transition-all shadow-sm pointer-events-auto"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun size={20} className="text-yellow-500 fill-yellow-500" />
      ) : (
        <Moon size={20} className="text-purple-500 fill-purple-500" />
      )}
    </button>
  );
}


