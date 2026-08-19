import Image from "next/image";
import type { CSSProperties } from "react";

const LINE_NAMES: Record<string, string> = {
  "line-1": "Yonge-University",
  "line-2": "Bloor-Danforth",
  "line-4": "Sheppard",
  "line-5": "Eglinton",
  "line-6": "Finch West",
  "go-br": "Barrie",
  "go-ki": "Kitchener",
  "go-le": "Lakeshore East",
  "go-lw": "Lakeshore West",
  "go-mi": "Milton",
  "go-rh": "Richmond Hill",
  "go-st": "Stouffville",
  "up-express": "UP Express",
};

const FALLBACK_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  "line-1": { backgroundColor: "#F8C300", color: "#000000" },
  "line-2": { backgroundColor: "#00923F", color: "#ffffff" },
  "line-4": { backgroundColor: "#A21A68", color: "#ffffff" },
  "line-5": { backgroundColor: "#EB8738", color: "#ffffff" },
  "line-6": { backgroundColor: "#969594", color: "#ffffff" },
  "go-br": { backgroundColor: "#155BA0", color: "#ffffff" },
  "go-ki": { backgroundColor: "#138336", color: "#ffffff" },
  "go-le": { backgroundColor: "#EE2722", color: "#ffffff" },
  "go-lw": { backgroundColor: "#8B0A31", color: "#ffffff" },
  "go-mi": { backgroundColor: "#F47216", color: "#ffffff" },
  "go-rh": { backgroundColor: "#27ADEA", color: "#ffffff" },
  "go-st": { backgroundColor: "#774111", color: "#ffffff" },
  "up-express": { backgroundColor: "#4084CD", color: "#ffffff" },
};

function regionalBadgeAssetId(lineId: string) {
  if (lineId === "regional-up") return "up-express";
  if (lineId.startsWith("regional-")) return `go-${lineId.replace("regional-", "")}`;
  return lineId;
}

export function transitLineBadgeColors(lineId: string) {
  const assetId = regionalBadgeAssetId(lineId);
  return FALLBACK_COLORS[assetId] ?? { backgroundColor: "#64748b", color: "#ffffff" };
}

export function transitLineBadgeSrc(lineId: string) {
  const assetId = regionalBadgeAssetId(lineId);
  return LINE_NAMES[assetId]
    ? `/assets/linewatch/${assetId}-legend.svg?v=3`
    : null;
}

type TransitLineBadgeProps = {
  lineId: string;
  lineNumber?: string;
  lineName?: string;
  size?: number;
  className?: string;
  decorative?: boolean;
};

/** The authored TTC-style legend badge, reused at the size required by each surface. */
export function TransitLineBadge({
  lineId,
  lineNumber = lineId.startsWith("go-")
    ? lineId.replace("go-", "").toUpperCase()
    : lineId === "up-express"
    ? "UP"
    : lineId.replace("line-", ""),
  lineName = LINE_NAMES[lineId],
  size = 24,
  className = "",
  decorative = false,
}: TransitLineBadgeProps) {
  const assetId = regionalBadgeAssetId(lineId);
  const resolvedLineName = lineName ?? LINE_NAMES[assetId];
  const label = lineName
    ? lineId.startsWith("line-")
      ? `Line ${lineNumber} ${lineName}`
      : lineName.endsWith("Express")
      ? lineName
      : `${lineName} Line`
    : resolvedLineName
      ? resolvedLineName.endsWith("Express")
        ? resolvedLineName
        : `${resolvedLineName} Line`
      : `Line ${lineNumber}`;
  const src = transitLineBadgeSrc(lineId);

  if (!src) {
    return (
      <span
        className={`transit-line-badge transit-line-badge--fallback ${className}`.trim()}
        style={{
          ...transitLineBadgeColors(lineId),
          "--transit-line-badge-size": `${size}px`,
        } as CSSProperties}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : label}
        title={decorative ? undefined : label}
      >
        {lineNumber}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={decorative ? "" : label}
      title={decorative ? undefined : label}
      width={size}
      height={size}
      className={`transit-line-badge ${className}`.trim()}
      style={{
        "--transit-line-badge-size": `${size}px`,
        width: size,
        height: size,
      } as CSSProperties}
      aria-hidden={decorative || undefined}
    />
  );
}
