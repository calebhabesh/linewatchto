"use client";

import { Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { apiUrl } from "../../app/api-client";
import { buildExportPath, type AnalyticsNetworkId } from "../../app/reliability-analytics";
import styles from "./analytics.module.css";

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

/**
 * CSV export link to `/api/reliability/export`.
 * Keeps a real `href` for accessibility/inspection while intercepting clicks to visibly handle
 * 429 rate limits (10 per 10 min) and the 20,000-row cap instead of navigating to raw JSON.
 */
export function ExportControl({
  networkId,
  from,
  to,
  line,
  station,
  disabled,
  demo,
}: {
  networkId: AnalyticsNetworkId;
  from: string | null;
  to: string | null;
  line: string | null;
  station: string | null;
  disabled: boolean;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const exportPath = from && to ? buildExportPath(networkId, from, to, line, station) : null;
  const href = exportPath ? apiUrl(exportPath) : undefined;

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!href || disabled || busy) return;
    if (demo) {
      setStatusMessage({ tone: "info", text: "CSV export is available for live data only." });
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (response.ok) {
        const blob = await response.blob();
        const fallback = `linewatchto-reliability-${networkId}-${from}-to-${to}.csv`;
        const filename = parseFilename(response.headers.get("content-disposition"), fallback);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
        return;
      }
      if (response.status === 429) {
        setStatusMessage({
          tone: "error",
          text: "Export limit reached (10 exports per 10 minutes). Wait a few minutes, then try again.",
        });
        return;
      }
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (body?.error === "export_too_large") {
        setStatusMessage({
          tone: "error",
          text: body.message ?? "This export exceeds the 20,000-row limit. Choose a shorter range or a single line.",
        });
        return;
      }
      setStatusMessage({
        tone: "error",
        text: body?.message ?? "CSV export could not be completed right now.",
      });
    } catch {
      setStatusMessage({
        tone: "error",
        text: navigator.onLine
          ? "CSV export could not be reached."
          : "You are offline. CSV export needs a connection.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.exportWrap}>
      {href && !disabled ? (
        <a
          href={href}
          download
          className={styles.exportButton}
          aria-busy={busy || undefined}
          onClick={(event) => void handleClick(event)}
        >
          <Download size={15} aria-hidden="true" />
          <span>{busy ? "Exporting..." : "Export CSV"}</span>
        </a>
      ) : (
        <span className={styles.exportButton} aria-disabled="true">
          <Download size={15} aria-hidden="true" />
          <span>Export CSV</span>
        </span>
      )}
      {statusMessage ? (
        <div className={styles.exportStatus} data-tone={statusMessage.tone} role="alert">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>{statusMessage.text}</span>
        </div>
      ) : null}
    </div>
  );
}
