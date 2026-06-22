"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GoogleAccountsId = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    ux_mode?: "popup" | "redirect";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      logo_alignment?: "left" | "center";
    }
  ) => void;
  disableAutoSelect?: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

type GoogleSignInButtonProps = {
  clientId: string;
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
};

export function GoogleSignInButton({ clientId, disabled = false, onCredential, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const renderGoogleButton = useCallback(() => {
    const googleId = window.google?.accounts?.id;
    const buttonNode = buttonRef.current;
    if (!googleId || !buttonNode || !clientId || disabled || !window.google?.accounts?.id) {
      return;
    }

    buttonNode.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      ux_mode: "popup",
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
          return;
        }
        onError("Google sign-in did not return a credential.");
      },
    });
    window.google.accounts.id.renderButton(buttonNode, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 320,
      logo_alignment: "left",
    });
  }, [clientId, disabled, onCredential, onError]);

  useEffect(() => {
    if (scriptReady) {
      renderGoogleButton();
    }
  }, [renderGoogleButton, scriptReady]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="google-sign-in-slot" aria-disabled={disabled}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => onError("Google sign-in could not load.")}
      />
      <div ref={buttonRef} className={disabled ? "pointer-events-none opacity-60" : ""} />
    </div>
  );
}
