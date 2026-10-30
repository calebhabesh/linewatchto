import { MAP_HOVER_OUTLINE_WIDTHS, mapOverlayId, type MapOverlayPlane } from "./overlay-plane.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Chooser and badge previews: one outline around every previewed alert,
 * matching MapHoverOutline. It is written straight into its layer so a hover
 * shows before the next paint without rendering the map, and it never
 * repaints alert artwork, so the map keeps its resting paint order.
 *
 * `keys` are `kind:id` alert keys; `pathsByImpact` gives each alert's paths in
 * overlay coordinates (lineAlertPathsByImpact).
 */
export function renderMapPreviewOutline(
  layer: SVGGElement,
  keys: string[],
  pathsByImpact: Map<string, string[]>,
  plane: MapOverlayPlane,
) {
  layer.replaceChildren();
  const paths = keys.flatMap((key) => pathsByImpact.get(key) ?? []);
  if (paths.length === 0) return;
  const documentNode = layer.ownerDocument;
  const element = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) => {
    const node = documentNode.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const width = (value: number) => value * plane.unit;
  const bounds = plane.maskBounds;
  const maskId = mapOverlayId(plane, "impact-preview-outline", ...keys);
  const mask = (id: string, cutoutClass: string, cutoutWidth: number) => {
    const node = element("mask", {
      id,
      maskUnits: "userSpaceOnUse",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    const stroke = (className: string, color: string, strokeWidth: number) => paths.map((d) => element("path", {
      class: className,
      d,
      fill: "none",
      stroke: color,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": strokeWidth,
      style: `stroke-width: ${strokeWidth}`,
    }));
    node.append(
      ...stroke("map-impact-hover-outline-mask-outer", "white", width(MAP_HOVER_OUTLINE_WIDTHS.outer)),
      ...stroke(cutoutClass, "black", cutoutWidth),
      ...plane.outlineCutouts.map((cutout) => element("rect", {
        class: "map-impact-hover-outline-cutout",
        x: cutout.x,
        y: cutout.y,
        width: cutout.width,
        height: cutout.height,
        rx: cutout.rx,
        ry: cutout.ry,
        fill: "black",
        stroke: "black",
        "stroke-width": cutout.strokeWidth,
      })),
    );
    return node;
  };
  const defs = element("defs", {});
  defs.append(
    mask(maskId, "map-impact-hover-outline-mask-cutout", width(MAP_HOVER_OUTLINE_WIDTHS.inner)),
    mask(`${maskId}-outer`, "map-impact-hover-outline-mask-divider", width(MAP_HOVER_OUTLINE_WIDTHS.divider)),
  );
  const strokes = (className: string, id: string, color: string) => {
    const group = element("g", { mask: `url(#${id})` });
    group.append(...paths.map((d) => element("path", {
      class: `map-impact-hover-outline ${className}`,
      d,
      style: `stroke: ${color}; stroke-width: ${width(MAP_HOVER_OUTLINE_WIDTHS.outer)}`,
    })));
    return group;
  };
  const outline = element("g", { class: "map-impact-preview-outline", "data-map-preview-impacts": keys.join(" ") });
  if (plane.topPlaneTransform) outline.setAttribute("transform", plane.topPlaneTransform);
  outline.append(
    defs,
    strokes("map-impact-hover-outline-core", maskId, "rgba(15, 23, 42, 0.98)"),
    strokes("map-impact-hover-outline-edge", `${maskId}-outer`, "rgba(248, 250, 252, 0.98)"),
  );
  layer.append(outline);
}
