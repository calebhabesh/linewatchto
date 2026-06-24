"use client";

import Image from "next/image";
import { Download, Smartphone, SquarePlus, X } from "lucide-react";
import type { PwaInstallPlatform } from "../app/pwa-install-state";

// Guide icon for reference: /assets/linewatch/guide-icons/add-to-homescreen-android.svg

type PwaInstallNudgeProps = {
  installing: boolean;
  onDismiss: () => void;
  onRequestInstall: () => void;
  platform: PwaInstallPlatform;
};

function InstallGuideIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={14}
      height={14}
      className="pwa-install-nudge-step-asset"
    />
  );
}

export function PwaInstallNudge({
  installing,
  onDismiss,
  onRequestInstall,
  platform,
}: PwaInstallNudgeProps) {
  const isIos = platform === "ios";

  return (
    <aside className="pwa-install-nudge" aria-label="Install LineWatchTO" role="region">
      <div className="pwa-install-nudge-icon" aria-hidden="true">
        <Smartphone size={18} />
      </div>

      <div className="pwa-install-nudge-copy">
        <strong>Add LineWatchTO to your home screen</strong>
        <span>Opens full-screen for quicker commute checks.</span>
        {isIos ? (
          <ol className="pwa-install-nudge-steps" aria-label="iPhone install steps">
            <li>
              <InstallGuideIcon src="/assets/linewatch/guide-icons/share-iphone.svg" />
              <span>Tap Share</span>
            </li>
            <li>
              <SquarePlus size={14} aria-hidden="true" />
              <span>Add to Home Screen</span>
            </li>
          </ol>
        ) : null}
      </div>

      <div className="pwa-install-nudge-actions">
        <button
          type="button"
          className="pwa-install-nudge-primary"
          disabled={installing}
          onClick={isIos ? onDismiss : onRequestInstall}
        >
          {isIos ? (
            "Got it"
          ) : (
            <>
              <Download size={14} aria-hidden="true" />
              {installing ? "Opening" : "Install"}
            </>
          )}
        </button>
        <button
          type="button"
          className="pwa-install-nudge-dismiss"
          aria-label="Dismiss install prompt"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
