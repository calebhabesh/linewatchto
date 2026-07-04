"use client";

import Image from "next/image";
import { Download, MoreVertical, Smartphone, SquarePlus, X } from "lucide-react";
import {
  getPwaInstallInstructionText,
  type PwaInstallPlatform,
} from "../app/pwa-install-state";

// Guide icon for reference: /assets/linewatch/guide-icons/add-to-homescreen-android.svg

type PwaInstallNudgeProps = {
  hasNativePrompt: boolean;
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
  hasNativePrompt,
  installing,
  onDismiss,
  onRequestInstall,
  platform,
}: PwaInstallNudgeProps) {
  const usesNativePrompt =
    hasNativePrompt && (platform === "android-chrome" || platform === "android-chromium");
  const showIosSteps = platform === "ios-safari" || platform === "ios-other";
  const showAndroidSteps = platform.startsWith("android") && !usesNativePrompt;
  const instructionText = getPwaInstallInstructionText({
    platform,
    nativePromptAvailable: hasNativePrompt,
  });

  return (
    <aside className="pwa-install-nudge" aria-label="Install LineWatchTO" role="region">
      <div className="pwa-install-nudge-icon" aria-hidden="true">
        <Smartphone size={18} />
      </div>

      <div className="pwa-install-nudge-copy">
        <strong>Add LineWatchTO to your home screen</strong>
        <span>{instructionText}</span>
        {showIosSteps ? (
          <ol className="pwa-install-nudge-steps" aria-label="iOS install steps">
            {platform === "ios-other" ? (
              <li>
                <Smartphone size={14} aria-hidden="true" />
                <span>Open Safari</span>
              </li>
            ) : null}
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
        {showAndroidSteps ? (
          <ol className="pwa-install-nudge-steps" aria-label="Android install steps">
            <li>
              <MoreVertical size={14} aria-hidden="true" />
              <span>Open menu</span>
            </li>
            <li>
              <InstallGuideIcon src="/assets/linewatch/guide-icons/add-to-homescreen-android.svg" />
              <span>Add to Home screen</span>
            </li>
          </ol>
        ) : null}
      </div>

      <div className="pwa-install-nudge-actions">
        <button
          type="button"
          className="pwa-install-nudge-primary"
          disabled={installing}
          onClick={usesNativePrompt ? onRequestInstall : onDismiss}
        >
          {usesNativePrompt ? (
            <>
              <Download size={14} aria-hidden="true" />
              {installing ? "Opening" : "Install"}
            </>
          ) : (
            "Got it"
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
