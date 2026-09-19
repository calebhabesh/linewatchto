import type { MapImpactKind } from "../app/linewatch-data";

export const OVERLAP_INDICATOR_SCALE = 1.5;
export const OVERLAP_BADGE_CIRCLE_RADIUS = 35;
export const OVERLAP_BADGE_ITEM_GAP = 10;
export const OVERLAP_BADGE_ITEM_SPACING =
  OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP;
export const OVERLAP_BADGE_PILL_THICKNESS =
  OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP * 2;
export const MAP_BADGE_GLYPH_TOP = 124;
export const MAP_BADGE_GLYPH_BOTTOM = 1662;
export const MAP_BADGE_GLYPH_GAP = 28;

export type MapBadgeGlyph = "+" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

// Fixed Inter Black outlines keep the map counters typographically consistent
// without reintroducing browser-rendered SVG text that mobile Chromium can inflate.
export const MAP_BADGE_GLYPH_OUTLINES: Record<MapBadgeGlyph, { width: number; path: string }> = {
  "0": {
    width: 1446,
    path: "M728 1658q-207 0-354-91t-225.5-261.5t-78.5-411.5t78.5-412.5t225.5-262.5t354-91t354.5 91.5t225.5 262.5t78 412t-78 411.5t-225 261.5t-355 91zm0-328q116 0 177-112t61-324q0-213-61-326.5t-177-113.5q-115 0-176.5 114t-61.5 326t61 324t177 112z",
  },
  "1": {
    width: 916,
    path: "M830 148v1490H426V496h-10L90 716V372l334-224h406z",
  },
  "2": {
    width: 1314,
    path: "M98 1638v-290l556-460q83-68 130.5-127.5t47.5-138.5q0-85-53.5-133.5T642 440q-85 0-136.5 50T454 634H70q0-157 70.5-270T340 189.5T642 128q179 0 310 57t202.5 160.5T1226 588q0 86-35.5 170.5T1063 946t-263 244l-140 116v10h582v322H98z",
  },
  "3": {
    width: 1360,
    path: "M680 1658q-176 0-312.5-60.5t-214-167.5T76 1184h406q0 65 57 106.5t145 41.5q84 0 136-43.5t52-112.5q0-68-61-111t-159-43H500V742h152q90 0 147-43.5t57-110.5q0-65-48-106.5T684 440q-84 0-138 43t-54 111H104q0-137 74.5-242T384 187.5T684 128q165 0 292 56t198.5 154T1246 562q0 124-86.5 204.5T940 862v10q180 20 270 110.5t90 227.5q0 131-79 232.5T1002.5 1601T680 1658z",
  },
  "4": {
    width: 1428,
    path: "M84 1406v-314l600-944h512v944h172v314h-172v232H808v-232H84zm734-314V568h-12l-324 512v12h336z",
  },
  "5": {
    width: 1314,
    path: "M656 1658q-172 0-305-60.5t-209-167.5t-78-246h394q0 77 58.5 122.5T656 1352q92 0 150-58.5t58-155.5q0-98-58-157t-150-59q-65 0-118.5 31T458 1038l-356-70 58-820h1002v324H492l-28 328h8q35-68 121-112t199-44q133 0 237 61.5t164.5 170T1254 1126q0 156-74 276t-208.5 188T656 1658z",
  },
  "6": {
    width: 1372,
    path: "M716 1658q-130 0-247-41t-206.5-130T122 1255.5T70 910q0-241 80.5-416.5T377 223t341-95q165 0 290 63.5t199.5 169T1294 594H896q-13-64-63.5-93T718 472q-127 0-186.5 110T472 872h8q43-102 148-160t232-58q136 0 237.5 61t158 167.5t56.5 243.5q0 160-76 280t-210 186t-310 66zm-4-306q91 0 149.5-60t58.5-152t-58.5-152T712 928q-88 0-147 60t-59 152t59 152t147 60z",
  },
  "7": {
    width: 1208,
    path: "M158 1638 742 480v-8H56V148h1106v324L574 1638H158z",
  },
  "8": {
    width: 1380,
    path: "M694 1658q-180 0-321-56t-222-152t-81-216q0-92 46-168.5T240.5 938T416 872v-10q-127-23-209.5-114.5T124 532q0-117 74-208t203-143.5T694 128q165 0 294.5 52.5t203.5 144t74 207.5q0 125-83.5 216T974 862v10q96 15 174.5 66t125 127.5T1320 1234q0 120-81 216t-222.5 152T694 1658zm0-278q86 0 142-51.5t56-130.5q0-77-56-126.5T694 1022q-85 0-140.5 49.5T498 1198q0 78 55.5 130t140.5 52zm0-638q77 0 126.5-46t49.5-116t-49.5-115T694 420q-75 0-124.5 44.5T520 580q0 69 49.5 115.5T694 742z",
  },
  "9": {
    width: 1372,
    path: "M664 1662q-164 0-289.5-64.5T176 1426.5T88 1192h398q14 64 64 95t114 31q128 0 187-112t59-292h-8q-43 102-148 160t-232 58q-135 0-237-61T126.5 903T70 660q0-161 76-281.5T356.5 191T666 124q131 0 247.5 41.5t206 131t141 233t51.5 346.5q0 241-80.5 417.5T1005 1566t-341 96zm6-804q89 0 147.5-60.5T876 646q0-92-58.5-152T670 434t-148.5 60T462 646t59 152t149 60z",
  },
  "+": {
    width: 1410,
    path: "M547 1572v-384H172V878h375V494h326v384h375v310H873v384H547z",
  },
};

export type MapOverlapBadgeKindCount = {
  kind: MapImpactKind;
  count: number;
};

export type MapOverlapBadgeOptions = {
  kindCounts: MapOverlapBadgeKindCount[];
  isDark?: boolean;
  highContrast?: boolean;
  isSelected?: boolean;
};

export function getOverlapBadgeDimensions(visualItemCount: number): { width: number; height: number } {
  if (visualItemCount <= 1) {
    return {
      width: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
      height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
    };
  }
  const visibleCount = Math.min(3, visualItemCount);
  const hasMore = visualItemCount > visibleCount;
  const totalItems = visibleCount + (hasMore ? 1 : 0);
  return {
    width: Math.max(
      OVERLAP_BADGE_PILL_THICKNESS,
      (totalItems - 1) * OVERLAP_BADGE_ITEM_SPACING + OVERLAP_BADGE_PILL_THICKNESS,
    ) * OVERLAP_INDICATOR_SCALE,
    height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
  };
}

export function renderVectorLabelSvg(
  label: string,
  cx: number,
  cy: number,
  targetHeight: number,
  maxWidth: number,
): string {
  const glyphs = [...label].filter((g): g is MapBadgeGlyph => g in MAP_BADGE_GLYPH_OUTLINES);
  const contentWidth = glyphs.reduce(
    (w, g) => w + MAP_BADGE_GLYPH_OUTLINES[g].width,
    Math.max(0, glyphs.length - 1) * MAP_BADGE_GLYPH_GAP,
  );
  const glyphHeight = MAP_BADGE_GLYPH_BOTTOM - MAP_BADGE_GLYPH_TOP;
  const scale = Math.min(targetHeight / glyphHeight, maxWidth / contentWidth);
  let cursorX = 0;
  const paths = glyphs.map((g) => {
    const outline = MAP_BADGE_GLYPH_OUTLINES[g];
    const x = cursorX;
    cursorX += outline.width + MAP_BADGE_GLYPH_GAP;
    return `<path d="${outline.path}" transform="translate(${x} 0)" />`;
  }).join("");
  const tx = cx - (contentWidth * scale) / 2;
  const ty = cy - (MAP_BADGE_GLYPH_TOP + glyphHeight / 2) * scale;
  return `<g fill="#ffffff" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${paths}</g>`;
}

export function getKindIconSvg(kind: MapImpactKind, x: number, isDark: boolean, index: number): string {
  if (kind === "suspension") {
    return `<svg x="${x - 22}" y="-22" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
  }
  if (kind === "planned-closure") {
    return `<svg x="${x - 22}" y="-22" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" stroke="#3b82f6" stroke-width="2"/><path d="M3 9H21M12 12V15M12 18H12.01M7 3V5M17 3V5" stroke="#3b82f6" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>`;
  }
  if (kind === "reduced-speed-zone") {
    return `<svg x="${x - 22}" y="-22" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/></svg>`;
  }
  // delay
  const exclamationColor = isDark ? "#0f172a" : "rgba(255, 255, 255, 0.94)";
  const maskId = `delay-mask-${index}-${Math.round(x)}`;
  return `<svg x="${x - 22}" y="-22" width="44" height="44" viewBox="0 0 24 24"><defs><mask id="${maskId}"><rect x="0" y="0" width="24" height="24" fill="#ffffff" /><circle cx="18" cy="18" r="6.8" fill="#000000" /></mask></defs><g mask="url(#${maskId})"><path fill="#FEEC41" transform="translate(-0.8 -0.8) scale(0.8)" d="M7 4v2h2v4a7.001 7.001 0 0 0 3.406 6A7.001 7.001 0 0 0 9 22v4H7v2h18v-2h-2v-4a7.001 7.001 0 0 0-3.406-6A7.001 7.001 0 0 0 23 10V6h2V4zm4 2h10v4c0 2.773-2.227 5-5 5s-5-2.227-5-5zm1.156 5c.446 1.723 1.98 3 3.844 3c1.863 0 3.398-1.277 3.844-3zM16 17c2.773 0 5 2.227 5 5v4h-1c0-2.21-1.79-4-4-4s-4 1.79-4 4h-1v-4c0-2.773 2.227-5 5-5z" /></g><circle cx="18" cy="18" r="5.2" fill="#FEEC41" /><path d="M18 14.5v3.2" fill="none" stroke="${exclamationColor}" stroke-width="1.6" stroke-linecap="round" /><circle cx="18" cy="20.1" r="0.9" fill="${exclamationColor}" /></svg>`;
}

export function generateOverlapBadgeSvg({
  kindCounts,
  isDark = false,
  highContrast = false,
  isSelected = false,
}: MapOverlapBadgeOptions): string {
  const visibleKindCounts = kindCounts.slice(0, 3);
  const hiddenKindCount = Math.max(0, kindCounts.length - visibleKindCounts.length);
  const totalItems = visibleKindCounts.length + (hiddenKindCount > 0 ? 1 : 0);
  const isSingleVisualItem = totalItems === 1;

  const { width, height } = getOverlapBadgeDimensions(totalItems);

  const pillFill = isDark || highContrast
    ? (isSelected ? "rgba(15, 23, 42, 0.98)" : "rgba(15, 23, 42, 0.94)")
    : (isSelected ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.94)");
  const pillStroke = isSelected
    ? "#60a5fa"
    : (isDark ? "rgba(255, 255, 255, 0.3)" : (highContrast ? "rgba(255, 255, 255, 0.5)" : "rgba(15, 23, 42, 0.28)"));
  const pillStrokeWidth = isSelected ? 6 : 4;

  const pillSvg = isSingleVisualItem
    ? `<circle cx="0" cy="0" r="${height / 2}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="${pillStrokeWidth}" />`
    : `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${height / 2}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="${pillStrokeWidth}" />`;

  const itemSvgs: string[] = [];
  visibleKindCounts.forEach(({ kind, count }, index) => {
    const x = (index - (totalItems - 1) / 2) * OVERLAP_BADGE_ITEM_SPACING;
    let badgeFill = "rgba(15, 23, 42, 0.92)";
    let badgeStroke = "#ffffff";
    if (kind === "suspension") {
      badgeFill = "rgba(239, 68, 68, 0.12)";
      badgeStroke = "#ef4444";
    } else if (kind === "planned-closure") {
      badgeFill = "rgba(59, 130, 246, 0.12)";
      badgeStroke = "#3b82f6";
    } else if (kind === "reduced-speed-zone") {
      badgeFill = "rgba(249, 115, 22, 0.14)";
      badgeStroke = "#f97316";
    } else if (kind === "delay") {
      badgeFill = "rgba(254, 236, 65, 0.14)";
      badgeStroke = "#FEEC41";
    }
    itemSvgs.push(`<circle cx="${x}" cy="0" r="${OVERLAP_BADGE_CIRCLE_RADIUS}" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="3.5" />`);
    itemSvgs.push(getKindIconSvg(kind, x, isDark || highContrast, index));
    if (count > 1) {
      const countStroke = isDark ? "#0f172a" : "rgba(15, 23, 42, 0.95)";
      itemSvgs.push(`<circle cx="${x + 28}" cy="-28" r="18" fill="#ef4444" stroke="${countStroke}" stroke-width="2.5" />`);
      itemSvgs.push(renderVectorLabelSvg(String(count), x + 28, -28, 22, 28));
    }
  });

  if (hiddenKindCount > 0) {
    const x = (visibleKindCounts.length - (totalItems - 1) / 2) * OVERLAP_BADGE_ITEM_SPACING;
    itemSvgs.push(`<circle cx="${x}" cy="0" r="27" fill="#334155" stroke="rgba(255, 255, 255, 0.42)" stroke-width="3.5" />`);
    itemSvgs.push(renderVectorLabelSvg(`+${hiddenKindCount}`, x, 0, 22, 44));
  }

  // 2x rasterization resolution for Retina sharpness in WebGL texture
  const renderWidth = width * 2;
  const renderHeight = height * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderWidth}" height="${renderHeight}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}">${pillSvg}<g transform="scale(${OVERLAP_INDICATOR_SCALE})">${itemSvgs.join("")}</g></svg>`;
}

export function getOverlapBadgeKey({
  kindCounts,
  isDark = false,
  highContrast = false,
  isSelected = false,
}: MapOverlapBadgeOptions): string {
  const theme = highContrast ? "hc" : (isDark ? "dark" : "light");
  const sel = isSelected ? "1" : "0";
  const kinds = kindCounts.map((k) => `${k.kind}.${k.count}`).join("_");
  return `overlap-badge:${theme}:${sel}:${kinds}`;
}

export function parseOverlapBadgeKey(id: string): MapOverlapBadgeOptions | null {
  if (!id || !id.startsWith("overlap-badge:")) return null;
  const parts = id.split(":");
  if (parts.length !== 4) return null;
  const [, theme, sel, kindsPart] = parts;
  const isDark = theme === "dark" || theme === "hc";
  const highContrast = theme === "hc";
  const isSelected = sel === "1";
  const kindCounts = kindsPart.split("_").map((item) => {
    const [kind, countStr] = item.split(".");
    return { kind: kind as MapImpactKind, count: parseInt(countStr, 10) || 1 };
  });
  return { kindCounts, isDark, highContrast, isSelected };
}

export async function createSvgImage(svgString: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  if (typeof img.decode === "function") {
    try {
      await img.decode();
      return img;
    } catch {
      // Fallback to onload
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
}
