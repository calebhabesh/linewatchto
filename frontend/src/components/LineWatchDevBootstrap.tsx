"use client";

import { useEffect, useState } from "react";
import { getCurrentAccount, loginDevAccount } from "../app/account-data";
import type { DashboardData } from "../app/DataContext";
import { LineWatchShell } from "./LineWatchShell";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function devAccountAutoLoginConfigured() {
  return process.env.NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN === "true" &&
    process.env.NODE_ENV === "development";
}

function browserHostname() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hostname;
}

export function shouldAutoLoginDevAccount(hostname = browserHostname()) {
  return devAccountAutoLoginConfigured() && LOCAL_DEV_HOSTS.has(hostname);
}

type LineWatchDevBootstrapProps = {
  initialData: DashboardData;
};

export function LineWatchDevBootstrap({ initialData }: LineWatchDevBootstrapProps) {
  const [ready, setReady] = useState(() => !devAccountAutoLoginConfigured());

  useEffect(() => {
    if (!devAccountAutoLoginConfigured()) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        if (shouldAutoLoginDevAccount()) {
          const current = await getCurrentAccount();
          if (!current.authenticated) {
            await loginDevAccount();
          }
        }
      } catch (error) {
        console.warn("LineWatchTO dev account auto-login failed.", error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return null;
  }

  return <LineWatchShell initialData={initialData} />;
}
