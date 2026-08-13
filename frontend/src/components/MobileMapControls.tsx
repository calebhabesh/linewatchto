"use client";

import { Locate, X } from "lucide-react";

export type MapPresentationMode = "standard" | "rotated-landscape";

/** Inline SVG for the phone-rotate-landscape icon (fill="currentColor") */
export function PhoneRotateLandscapeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9 1H3a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2m0 14H3V3h6v12m12-2h-8v2h8v6H9v-1H6v1a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2m2-3l-4-2l1.91-.91A7.516 7.516 0 0 0 14 2.5V1a9 9 0 0 1 9 9Z" />
    </svg>
  );
}

type Props = {
  presentationMode: MapPresentationMode;
  onExitRotated: () => void;
  onRecenter: () => void;
};

export function MobileMapControls({
  presentationMode,
  onExitRotated,
  onRecenter,
}: Props) {
  if (presentationMode !== "rotated-landscape") return null;

  return (
    <div className="mobile-map-controls" data-mode={presentationMode} data-map-chooser-keepout>
      <button
        type="button"
        className="mobile-map-control-button mobile-map-control-button-strong"
        aria-label="Exit rotated map"
        onClick={onExitRotated}
      >
        <X size={18} aria-hidden="true" />
        <span>Exit</span>
      </button>

      <button
        type="button"
        className="mobile-map-control-button"
        aria-label="Center map"
        onClick={onRecenter}
      >
        <Locate size={18} aria-hidden="true" />
        <span>Center</span>
      </button>
    </div>
  );
}
