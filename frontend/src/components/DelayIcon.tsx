"use client";

import React from "react";

export function DelayIcon({ 
  size = 18, 
  className = "",
  filled = true 
}: { 
  size?: number; 
  className?: string; 
  filled?: boolean;
}) {
  const maskId = React.useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <mask id={maskId}>
          {/* Everything white is visible */}
          <rect x="0" y="0" width="24" height="24" fill="#ffffff" />
          {/* Black circle cuts out the clock line to create a transparent gap */}
          <circle cx="18" cy="18" r="6.5" fill="#000000" />
        </mask>
      </defs>
      {/* Clock Circle and Hands, masked to create a gap around the badge */}
      <g mask={`url(#${maskId})`}>
        <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M11 6v5h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* Warning Badge */}
      <circle 
        cx="18" 
        cy="18" 
        r="5" 
        fill={filled ? "currentColor" : "none"} 
        stroke="currentColor" 
        strokeWidth={filled ? "0" : "1.5"} 
      />
      {/* Exclamation Point inside Badge */}
      <path 
        d="M18 15.5v2.5" 
        fill="none" 
        stroke={filled ? "#ffffff" : "currentColor"} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
      <circle 
        cx="18" 
        cy="20.25" 
        r="0.75" 
        fill={filled ? "#ffffff" : "currentColor"} 
      />
    </svg>
  );
}
