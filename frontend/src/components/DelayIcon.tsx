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
  const rawId = React.useId();
  const maskId = `delay-mask-${rawId.replace(/:/g, "")}`;
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
          {/* Black circle cuts out the hourglass line to create a transparent gap */}
          <circle cx="18" cy="18" r="6.8" fill="#000000" />
        </mask>
      </defs>
      {/* Hourglass shape, masked to create a gap around the badge */}
      <g mask={`url(#${maskId})`}>
        <path
          fill="currentColor"
          transform="translate(-0.8 -0.8) scale(0.8)"
          d="M7 4v2h2v4a7.001 7.001 0 0 0 3.406 6A7.001 7.001 0 0 0 9 22v4H7v2h18v-2h-2v-4a7.001 7.001 0 0 0-3.406-6A7.001 7.001 0 0 0 23 10V6h2V4zm4 2h10v4c0 2.773-2.227 5-5 5s-5-2.227-5-5zm1.156 5c.446 1.723 1.98 3 3.844 3c1.863 0 3.398-1.277 3.844-3zM16 17c2.773 0 5 2.227 5 5v4h-1c0-2.21-1.79-4-4-4s-4 1.79-4 4h-1v-4c0-2.773 2.227-5 5-5z"
        />
      </g>
      {/* Warning Badge */}
      <circle 
        cx="18" 
        cy="18" 
        r="5.2" 
        fill={filled ? "currentColor" : "none"} 
        stroke="currentColor" 
        strokeWidth={filled ? "0" : "1.5"} 
      />
      {/* Exclamation Point inside Badge */}
      {filled && (
        <>
          <path 
            d="M18 14.5v3.2" 
            fill="none" 
            stroke="#0d0808"
            className="delay-badge-exclamation"
            strokeWidth="1.6" 
            strokeLinecap="round" 
          />
          <circle 
            cx="18" 
            cy="20.8" 
            r="0.9" 
            fill="#0d0808"
            className="delay-badge-exclamation-dot"
          />
        </>
      )}
      {!filled && (
        <>
          <path 
            d="M18 14.5v3.2" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.6" 
            strokeLinecap="round" 
          />
          <circle 
            cx="18" 
            cy="20.8" 
            r="0.9" 
            fill="currentColor" 
          />
        </>
      )}
    </svg>
  );
}
