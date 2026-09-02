/**
 * F2C port. Restored from git history (commit `7ce9238`,
 * packages/backend/src/designBundle/designBundleTree.ts) -- an earlier
 * change deleted this alongside the standalone "Design Bundle" export
 * button it used to feed, but the button and this generation logic were
 * separable, and this logic is exactly the translation layer: an
 * internal-only DesignBundle-shaped object built from F2C's own
 * `nodesToJSON` output, feeding the ported wp-figma-gen generation code
 * unchanged. Only the import sources changed -- `DesignBundle*`/
 * `DesignNode*` types now come from this fork's own internal
 * `../core/types/designBundle` rather than the public `"types"` package
 * the old, now-removed button surfaced them through. Logic is otherwise
 * unchanged from the original.
 */
import {
  DesignBundleAsset,
  DesignBundleBlendMode,
  DesignBundleColorStyle,
  DesignBundleEffect,
  DesignBundleFill,
  DesignBundleGradient,
  DesignBundleNodeStyle,
  DesignBundleStyles,
  DesignBundleTextSegment,
  DesignNode,
  DesignNodeType,
} from "../core/types/designBundle";
import {
  commonLetterSpacing,
  commonLineHeight,
} from "../../common/commonTextHeightSpacing";
import { CSS_BLEND_MODE_BY_FIGMA_BLEND_MODE } from "../../common/blendMode";
import { getCommonRadius } from "../../common/commonRadius";
import { commonStroke } from "../../common/commonStroke";
import { nodeSize } from "../../common/nodeWidthHeight";
import { DESIGN_BUNDLE_RASTER_SCALE } from "./designBundleAssets";

// The tree produced by `nodesToJSON` (packages/backend/src/altNodes/jsonNodeConversion.ts)
// is a standard Figma REST API v1 `Node` (packages/backend/src/api_types.ts) plus a handful
// of AltNode extras (`x/y/width/height`, `uniqueName`, `cumulativeRotation`, `canBeFlattened`,
// `styledTextSegments`). There is no single exported type for that combination, so we work
// against a loosely-typed shape here rather than fighting the type system — consistent with
// how the rest of the backend (code.ts, jsonNodeConversion.ts) already treats
// `convertedSelection` as `any`.
export type ConvertedNode = any;

const VECTOR_LIKE_TYPES = new Set([
  "VECTOR",
  "STAR",
  "POLYGON",
  "BOOLEAN_OPERATION",
  "LINE",
]);

let assetCounter = 0;
let nameCounters: Map<string, number> = new Map();
// Primary asset-dedup mechanism — keyed on the node's identity *within
// its master Component definition*, not on the specific Instance's own node
// id. See assetIdentityKeyFor's doc comment below for the ID-shape this
// relies on. Session-scoped, same lifetime/reset semantics as
// assetCounter/nameCounters above.
let assetIdentityMap: Map<string, DesignBundleAsset> = new Map();

export const resetDesignBundleTreeState = () => {
  assetCounter = 0;
  nameCounters = new Map();
  assetIdentityMap = new Map();
};

// Figma's REST API v1 (what nodesToJSON's whole tree is built from —
// see the ConvertedNode comment above) gives every node *inside* an
// Instance an id of the shape `I{instanceId};{masterChildId}` — confirmed
// directly against real exported bundles (e.g. `I2011:161;1:1468`). The
// part after the first semicolon is that node's own id *inside the master
// Component definition*, and is identical across every Instance of that
// component regardless of which design placed it — Figma's node-id space is
// unique file-wide, so this substring alone (no separate componentId lookup
// needed) already uniquely identifies "the same original node."
//
// A node that's directly part of a design's own tree (not inside any
// Instance) has a plain id with no semicolon — that includes an ordinary
// unique node, but also the literal master Component definition's own
// children on whatever page defines the component (found live: a real
// bundle where 4 designs used a footer Instance `I2011:121;1:1468` and a
// 5th held the footer's actual master-Component definition, whose own
// child node's plain id was exactly `1:1468` — the same masterChildId every
// Instance points at). Falling back to the node's own id as its key (rather
// than `undefined`, which always exported fresh) unifies both forms onto
// the same key with no ambiguity, since node ids are unique file-wide: the
// only way a bare id and a stripped `I...;X` key can ever collide is when
// they name the same underlying node. This also makes registration
// order-independent — whichever form (bare master-definition node, or
// `I...;X` Instance descendant) the tree walk reaches first registers the
// asset; the other looks it up and reuses it, regardless of which design
// came first in the selection.
//
// Deliberately identity-based, not content-based: a downstream consumer is
// free to layer a separate content-hash pass on top for anything this
// doesn't explain (e.g. two visually-identical but structurally unrelated
// nodes). This only recognizes "the same node, whether seen directly or
// through an Instance," and deliberately assumes no per-instance content
// overrides on shared header/footer content. A real override would
// currently dedupe silently wrong; revisit if that assumption ever proves
// false in practice.
const INSTANCE_DESCENDANT_ID = /^I[^;]+;(.+)$/;
const assetIdentityKeyFor = (nodeId: string): string =>
  INSTANCE_DESCENDANT_ID.exec(nodeId)?.[1] ?? nodeId;

const toSlug = (value: string) =>
  (value || "layer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "layer";

const nextAssetFileName = (uniqueName: string, ext: string): string => {
  assetCounter += 1;
  const slug = toSlug(uniqueName);
  const count = (nameCounters.get(slug) ?? 0) + 1;
  nameCounters.set(slug, count);
  const suffix = String(count).padStart(2, "0");
  return `assets/${slug}-${suffix}.${ext}`;
};

const rgbToHex = (color: { r: number; g: number; b: number }): string => {
  const toHex = (channel: number) =>
    Math.round(Math.max(0, Math.min(1, channel)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
};

const rgbaToHex8 = (color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): string => {
  const alpha = color.a ?? 1;
  const toHex = (channel: number) =>
    Math.round(Math.max(0, Math.min(1, channel)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `${rgbToHex(color)}${toHex(alpha)}`;
};

const findImageFill = (node: ConvertedNode): any | undefined => {
  const fills = node.fills;
  if (!Array.isArray(fills)) return undefined;
  return fills.find(
    (fill: any) => fill?.type === "IMAGE" && fill.visible !== false,
  );
};

const hasImageFill = (node: ConvertedNode): boolean =>
  findImageFill(node) !== undefined;

const hasRealChildren = (node: ConvertedNode): boolean =>
  Array.isArray(node.children) && node.children.length > 0;

const classifyNodeType = (node: ConvertedNode): DesignNodeType => {
  if (node.type === "TEXT") return "TEXT";
  if (VECTOR_LIKE_TYPES.has(node.type)) return "VECTOR";
  // Only collapse an image-filled node to a flattened IMAGE leaf when it has
  // no real children. Originally this collapsed *any* image-filled node
  // regardless of children — validated against a synthetic "hero banner with
  // an overlaid heading" fixture and found to silently drop the heading, a
  // real content-loss bug. A frame with both an image fill and child
  // content now stays a FRAME so its children survive; the background
  // image itself is still not representable in style.fills (schema only
  // models solid/gradient fills) — see the `backgroundAssetRef` handling
  // further down for how that gap is covered instead.
  if (hasImageFill(node) && !hasRealChildren(node)) return "IMAGE";
  if (node.type === "RECTANGLE" || node.type === "ELLIPSE") return "RECTANGLE";
  return "FRAME";
};

/**
 * Reads whichever of Figma's three corner-radius shapes this node has
 * (RectangleNode's rectangleCornerRadii, a uniform cornerRadius, or a
 * Frame-like node's individual topLeft/topRight/bottomRight/bottomLeft
 * radii) via the same getCommonRadius() every other backend already
 * uses, then collapses it to the single number Design Bundle schema v1
 * carries -- non-uniform corners are approximated by their largest
 * corner rather than dropped. (getCommonRadius checks rectangleCornerRadii
 * before cornerRadius, the opposite order this function used before this
 * extraction; harmless; per Figma's own API contract a RectangleNode's
 * cornerRadius is only ever a number when it already agrees with a
 * uniform rectangleCornerRadii, and figma.mixed otherwise, so the two
 * orders can never disagree on the resulting value.)
 */
const resolveCornerRadius = (node: ConvertedNode): number => {
  const radius = getCommonRadius(node);
  if ("all" in radius) return radius.all;
  return Math.max(
    radius.topLeft,
    radius.topRight,
    radius.bottomRight,
    radius.bottomLeft,
  );
};

// Figma's `paint.color.a` (alpha baked into the fill's own color) and
// `paint.opacity` (the fill's separate "opacity" slider) are two distinct
// fields that blend together — Figma's own doc comment on Paint.opacity:
// "colors within the paint can also have opacity values which would blend
// with this" — so they're combined into one effective alpha here, at the
// point of capture, rather than carried through as two separate numbers
// with no real downstream use for keeping them apart. `undefined` (not just
// `1`) is treated as "fully opaque" for both, matching Figma's own default.
const fillOpacity = (paint: any): number | undefined => {
  const colorAlpha = typeof paint.color?.a === "number" ? paint.color.a : 1;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  const combined = colorAlpha * paintOpacity;
  return combined < 1 ? combined : undefined;
};

// The three gradient kinds CSS can render natively. GRADIENT_DIAMOND is
// deliberately absent — no CSS equivalent, so it's left collapsed to a flat
// fallback color rather than approximated.
const GRADIENT_KIND_BY_PAINT_TYPE: Record<
  string,
  "LINEAR" | "RADIAL" | "ANGULAR"
> = {
  GRADIENT_LINEAR: "LINEAR",
  GRADIENT_RADIAL: "RADIAL",
  GRADIENT_ANGULAR: "ANGULAR",
};

// Structured gradient data (stops + Figma's own raw handle geometry,
// unconverted — see DesignBundleGradient's doc comment in types.ts for why
// the trig stays out of this step). Returns undefined for GRADIENT_DIAMOND,
// any unrecognized gradient kind, or if Figma's own gradientStops/
// gradientHandlePositions are missing on this paint — mapFill's caller
// still gets a flat `hex` fallback in every case via the first stop.
const mapGradient = (paint: any): DesignBundleGradient | undefined => {
  const kind = GRADIENT_KIND_BY_PAINT_TYPE[paint.type as string];
  if (!kind) return undefined;
  const stops = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
  const handles = Array.isArray(paint.gradientHandlePositions)
    ? paint.gradientHandlePositions
    : [];
  if (stops.length === 0 || handles.length === 0) return undefined;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  return {
    kind,
    stops: stops.map((stop: any) => ({
      hex: rgbaToHex8({
        ...stop.color,
        a: (stop.color?.a ?? 1) * paintOpacity,
      }),
      position: typeof stop.position === "number" ? stop.position : 0,
    })),
    handles: handles.map((handle: any) => ({
      x: handle?.x ?? 0,
      y: handle?.y ?? 0,
    })),
  };
};

const mapFill = (
  paint: any,
  styles: DesignBundleStyles,
): DesignBundleFill | null => {
  if (!paint || paint.visible === false) return null;
  if (paint.type === "IMAGE") return null; // handled via node.assetRef instead

  const variableId: string | undefined = paint.boundVariables?.color?.id;
  if (variableId && !styles.colors[variableId]) {
    const entry: DesignBundleColorStyle = {
      name: paint.boundVariables?.color?.name ?? variableId,
      hex: paint.color ? rgbToHex(paint.color) : "#000000",
    };
    styles.colors[variableId] = entry;
  }

  if (paint.type === "SOLID") {
    return {
      type: "SOLID",
      hex: paint.color ? rgbToHex(paint.color) : undefined,
      variableRef: variableId,
      opacity: fillOpacity(paint),
    };
  }

  if (typeof paint.type === "string" && paint.type.startsWith("GRADIENT")) {
    // Always carry a flat-color fallback — the first stop's own
    // color, with its alpha already combined with the paint's overall
    // opacity, as an 8-digit hex so no separate `opacity` field is
    // needed on the fallback either. Covers GRADIENT_DIAMOND and any
    // future gradient kind a downstream consumer can't render as real CSS.
    // Without this, any gradient-filled node would render with *no*
    // background whatsoever — not just for the GRADIENT_DIAMOND case.
    const firstStopColor = Array.isArray(paint.gradientStops)
      ? paint.gradientStops[0]?.color
      : undefined;
    const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    const fallbackHex = firstStopColor
      ? rgbaToHex8({
          ...firstStopColor,
          a: (firstStopColor.a ?? 1) * paintOpacity,
        })
      : undefined;
    return {
      type: "GRADIENT",
      hex: fallbackHex,
      variableRef: variableId,
      gradient: mapGradient(paint),
    };
  }

  return {
    type: "OTHER",
    variableRef: variableId,
    opacity: fillOpacity(paint),
  };
};

/**
 * Reads whichever of Figma's two stroke-weight shapes this node has
 * (individual per-side strokeTopWeight/etc., or a single uniform
 * strokeWeight) via the same commonStroke() every other backend already
 * uses, then collapses it to the single number Design Bundle schema v1
 * carries -- non-uniform per-side weights are approximated by their
 * largest side rather than dropped. Adopts commonStroke's convention for
 * a strokeWeight of exactly 0 or figma.mixed with no per-side weights:
 * treated as no determinable border (empty result) rather than guessing
 * a weight, matching how every other backend already treats that case
 * (see e.g. tailwindBorderWidth's `if (!commonBorder)` branch) instead
 * of this function's previous ad hoc "default to 1" guess.
 */
const mapStrokes = (node: ConvertedNode) => {
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  const commonBorder = commonStroke(node);
  if (!commonBorder) return [];
  const weight =
    "all" in commonBorder
      ? commonBorder.all
      : Math.max(
          commonBorder.left,
          commonBorder.right,
          commonBorder.top,
          commonBorder.bottom,
        );
  return strokes
    .filter((stroke: any) => stroke?.visible !== false && stroke?.color)
    .map((stroke: any) => ({ hex: rgbToHex(stroke.color), weight }));
};

const mapEffects = (node: ConvertedNode): DesignBundleEffect[] => {
  const effects = Array.isArray(node.effects) ? node.effects : [];
  return effects
    .filter((effect: any) => effect?.visible !== false)
    .map((effect: any) => {
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        return {
          type: effect.type,
          x: effect.offset?.x ?? 0,
          y: effect.offset?.y ?? 0,
          blur: effect.radius ?? 0,
          hex: effect.color ? rgbaToHex8(effect.color) : undefined,
          // Only meaningful for shadows — Figma's own `spread`, already
          // present on the raw effect object, is carried straight
          // through here.
          spread: typeof effect.spread === "number" ? effect.spread : undefined,
        };
      }
      return { type: effect.type, blur: effect.radius ?? 0 };
    });
};

// The node's own layer opacity (`HasBlendModeAndOpacityTrait.opacity`
// in the REST API v1 shape — every node type carries this), distinct from
// any individual fill's opacity above (see DesignBundleNodeStyle.opacity's
// doc comment in types.ts for why these aren't collapsed together).
// `undefined`/missing is Figma's own default for "fully opaque."
const nodeOpacity = (node: ConvertedNode): number | undefined => {
  const value = typeof node.opacity === "number" ? node.opacity : 1;
  return value < 1 ? value : undefined;
};

// Figma's 18 `BlendMode` values -> the 13 CSS `mix-blend-mode` has a
// native keyword for, via the table shared with `html/builderImpl/
// htmlBlend.ts` and `tailwind/builderImpl/tailwindBlend.ts` (see
// `common/blendMode.ts` -- this file used to keep its own independent
// copy of the same 14 entries). PASS_THROUGH/NORMAL map to `undefined`
// (no blending, same as this schema's other sparse-field opacity/
// gradient conventions) rather than being listed here with no value --
// they're absent from that table entirely, so the fallthrough
// `undefined` return below covers them along with LINEAR_BURN/
// LINEAR_DODGE (no CSS equivalent) and any future/unrecognized blend
// mode.
const nodeBlendMode = (
  node: ConvertedNode,
): DesignBundleBlendMode | undefined => {
  return CSS_BLEND_MODE_BY_FIGMA_BLEND_MODE[node.blendMode as string];
};

const mapStyle = (
  node: ConvertedNode,
  styles: DesignBundleStyles,
): DesignBundleNodeStyle => {
  const fills = Array.isArray(node.fills)
    ? (node.fills
        .map((fill: any) => mapFill(fill, styles))
        .filter(Boolean) as DesignBundleFill[])
    : [];
  return {
    fills,
    strokes: mapStrokes(node),
    cornerRadius: resolveCornerRadius(node),
    effects: mapEffects(node),
    opacity: nodeOpacity(node),
    blendMode: nodeBlendMode(node),
  };
};

/**
 * Adapts common/nodeWidthHeight.ts's nodeSize() -- shared by every other
 * backend -- to Design Bundle schema v1's DesignBundleSizeValue. Only
 * the boundary representation differs: nodeSize() returns `null` for
 * "hug" (a size-agnostic sentinel meaning "emit no explicit CSS size
 * declaration at all" -- see e.g. htmlSize.ts's `sizeToCss`-equivalent
 * handling), where this schema spells the same case out explicitly as
 * the string "hug" instead. Reusing nodeSize() also picks up its
 * structural `"layoutSizingHorizontal" in node` check (present only on
 * auto-layout-eligible nodes) in place of this function's previous
 * unconditional "not FILL/HUG -> must have a fixed number, default to
 * 0" fallback, which could silently emit a fabricated `width: 0px`/
 * `height: 0px` for a node with neither a sizing mode nor a usable fixed
 * value.
 */
const toDesignBundleSizeValue = (
  value: number | "fill" | null,
): "fill" | "hug" | number =>
  value === "fill" ? "fill" : value === null ? "hug" : Math.round(value);

const mapTextSegments = (
  node: ConvertedNode,
  uniqueName: string,
  styles: DesignBundleStyles,
): DesignBundleTextSegment[] => {
  const segments = Array.isArray(node.styledTextSegments)
    ? node.styledTextSegments
    : [];

  if (segments.length === 0) {
    // Fallback for nodes where per-run segmentation wasn't collected
    // (see jsonNodeConversion.ts — segments are only gathered when the
    // source node's style actually varies at the run level). `node.style`
    // here is the raw REST API v1 `TypeStyle` (see jsonNodeConversion.ts —
    // `Object.assign(jsonNode, jsonNode.style)` — `style` itself survives
    // alongside the flattened copy), which does carry `lineHeightPx`
    // (declared in api_types.ts) even though it isn't read elsewhere in
    // this file — compute the same px-per-fontSize ratio the segmented
    // path below uses instead of hardcoding 0, which silently dropped
    // line-height for any text node without per-run style variation.
    const fallbackFill = mapFill(node.fills?.[0], styles);
    const fallbackFontSize = node.style?.fontSize ?? 0;
    const fallbackLineHeightPx = node.style?.lineHeightPx;
    const fallbackLineHeight =
      typeof fallbackLineHeightPx === "number" && fallbackFontSize > 0
        ? fallbackLineHeightPx / fallbackFontSize
        : 0;
    return [
      {
        uniqueId: `${uniqueName}_span`,
        characters: node.characters ?? "",
        fontFamily: node.style?.fontFamily ?? "",
        fontSize: fallbackFontSize,
        fontWeight: String(node.style?.fontWeight ?? "400"),
        lineHeight: fallbackLineHeight,
        letterSpacing: node.style?.letterSpacing ?? 0,
        textCase: node.style?.textCase ?? "ORIGINAL",
        textDecoration: node.style?.textDecoration ?? "NONE",
        fillHex: fallbackFill?.hex,
        fillRef: fallbackFill?.variableRef,
        fillOpacity: fallbackFill?.opacity,
      },
    ];
  }

  return segments.map((segment: any, index: number) => {
    const fontSize = segment.fontSize ?? 0;
    const lineHeightPx = segment.lineHeight
      ? safeLineHeight(segment.lineHeight, fontSize)
      : 0;
    const letterSpacing = segment.letterSpacing
      ? safeLetterSpacing(segment.letterSpacing, fontSize)
      : 0;

    // Reuses mapFill (same hex+variableRef resolution node-level fills
    // already get, including registering variable-bound colors into
    // styles.colors) rather than only grabbing the variable id like
    // before — that silently dropped color entirely for any text run
    // using a plain, non-variable-bound color, which is the common case.
    const textFill = mapFill(segment.fills?.[0], styles);

    return {
      // The converter (jsonNodeConversion.ts) already assigns each segment a
      // `uniqueId` — 1-based, zero-padded (`_span_01`, `_span_02`, ...) for
      // multi-segment text, `_span` for a lone segment. Prefer that value
      // over regenerating one here (0-based, unpadded) so the two don't
      // disagree; only fall back to a freshly generated id if the segment
      // somehow arrived without one.
      uniqueId: segment.uniqueId ?? `${uniqueName}_span_${index}`,
      characters: segment.characters ?? "",
      fontFamily: segment.fontName?.family ?? segment.fontFamily ?? "",
      fontSize,
      fontWeight: String(segment.fontWeight ?? "400"),
      lineHeight: fontSize > 0 ? lineHeightPx / fontSize : 0,
      letterSpacing,
      textCase: segment.textCase ?? "ORIGINAL",
      textDecoration: segment.textDecoration ?? "NONE",
      fillHex: textFill?.hex,
      fillRef: textFill?.variableRef,
      fillOpacity: textFill?.opacity,
      // Already requested in getStyledTextSegments' field list
      // (jsonNodeConversion.ts) and threaded straight through here.
      textStyleId: segment.textStyleId || undefined,
    };
  });
};

// Wrapped so a malformed/unexpected LineHeight or LetterSpacing shape
// (e.g. from a node that isn't a real live Figma TEXT node, seen while
// testing against non-Auto-Layout content) degrades to 0 instead
// of throwing and aborting the whole export.
const safeLineHeight = (lineHeight: any, fontSize: number): number => {
  try {
    return commonLineHeight(lineHeight, fontSize) || 0;
  } catch {
    return 0;
  }
};
const safeLetterSpacing = (letterSpacing: any, fontSize: number): number => {
  try {
    return commonLetterSpacing(letterSpacing, fontSize) || 0;
  } catch {
    return 0;
  }
};

/**
 * Recursively converts one converted (AltNode-shaped) tree into a Design
 * Bundle `DesignNode` tree. Mutates `assets` and `styles` as it walks,
 * collecting an assets manifest for IMAGE/VECTOR leaves, and a resolved
 * colors dictionary for anything bound to a Figma variable.
 */
export const buildDesignNode = (
  node: ConvertedNode,
  assets: DesignBundleAsset[],
  styles: DesignBundleStyles,
  parentLayoutMode: string | undefined,
  // This node's index among its original parent's children (Figma's
  // paint/z-order — see the `paintOrder` field doc in types.ts). Only the
  // recursive call site below passes this; the root call
  // (designBundleMain.ts) omits it, since a `designs[].root` entry has no
  // real siblings within the bundle.
  siblingIndex?: number,
): DesignNode => {
  const uniqueName: string = node.uniqueName ?? node.name ?? node.id;
  const type = classifyNodeType(node);

  // CSS additively combines `gap` with `justify-content: space-between`
  // (unlike Figma, where SPACE_BETWEEN alignment itself determines the
  // spacing and itemSpacing plays no role) -- carrying itemSpacing
  // through as `gap` here whenever SPACE_BETWEEN is active would double
  // up the spacing in the rendered output. html's `getGap` (see
  // htmlAutoLayout.ts) hits the same CSS behavior and suppresses gap the
  // same way.
  const primaryAxisAlign = (node.primaryAxisAlignItems as any) ?? "MIN";
  const size = nodeSize(node);
  const layout: DesignNode["layout"] = {
    mode: (node.layoutMode as any) ?? "NONE",
    primaryAxisAlign,
    counterAxisAlign: (node.counterAxisAlignItems as any) ?? "MIN",
    gap: primaryAxisAlign === "SPACE_BETWEEN" ? 0 : (node.itemSpacing ?? 0),
    padding: {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    },
    sizing: {
      width: toDesignBundleSizeValue(size.width),
      height: toDesignBundleSizeValue(size.height),
    },
  };
  // Figma's Auto Layout wrap — `NO_WRAP` (the default) is never
  // recorded, matching this schema's general convention for
  // default-valued fields. `counterAxisSpacing` (row gap) only has real
  // meaning when wrap is on.
  if (node.layoutWrap === "WRAP") {
    layout.wrap = true;
    if (typeof node.counterAxisSpacing === "number") {
      layout.rowGap = node.counterAxisSpacing;
    }
  }
  // Rotation is fully independent of `position` below -- CSS
  // `transform: rotate()` applies the same way whether or not the node
  // is otherwise absolutely positioned, so every other backend in this
  // fork emits it unconditionally rather than gating it on position (see
  // e.g. html's htmlDefaultBuilder.ts, which runs `position()` and
  // `blend()` -- which includes rotation -- as two unconditional,
  // unrelated steps). Same sign convention and ancestor-rotation folding
  // as html's `htmlRotation`: Figma's rotation direction is opposite
  // CSS's, and `cumulativeRotation` (added by nodesToJSON's own AltNode
  // conversion) carries in any rotation already inherited from an
  // ancestor.
  const rotation =
    -Math.round((node.rotation ?? 0) + (node.cumulativeRotation ?? 0)) || 0;
  if (rotation !== 0) {
    layout.rotation = rotation;
  }
  // Position carries meaning when either the *parent* lays its children out
  // freely (mode NONE), or this specific node opts out of its parent's Auto
  // Layout flow (`layoutPositioning: "ABSOLUTE"`, Figma's per-child escape
  // hatch available even inside a HORIZONTAL/VERTICAL auto-layout parent).
  // The first version of this check only looked at the parent's overall
  // mode and silently dropped x/y for absolutely-positioned children of an
  // auto-layout frame — caught by a synthetic "decorative blob inside a
  // vertical form" fixture. Root designs[] entries have no parent, so
  // position is always included there.
  // `inlinedFromGroup` is a Design-Bundle-only flag set by
  // jsonNodeConversion.ts for children of an inlined GROUP (see its
  // comment there) — kept separate from the real `layoutPositioning`
  // field so this bundle-specific treatment doesn't leak into the other
  // codegen targets that share that conversion path.
  const isAbsoluteInAutoLayout =
    node.layoutPositioning === "ABSOLUTE" || node.inlinedFromGroup === true;
  if (
    parentLayoutMode === undefined ||
    parentLayoutMode === "NONE" ||
    isAbsoluteInAutoLayout
  ) {
    layout.position = {
      x: Math.round(node.x ?? 0),
      y: Math.round(node.y ?? 0),
    };
  }

  const designNode: DesignNode = {
    id: node.id,
    uniqueName,
    type,
    layout,
    style: mapStyle(node, styles),
    children: [],
    // Index within *this specific call's* parent — i.e. relative to
    // whatever `node`'s immediate parent was at the point this walk
    // reached it. Never a global/whole-tree counter. That single, uniform
    // rule is what makes this work correctly both for a repeated
    // component's own internal children (e.g. a header's logo/nav/button
    // get 0/1/2, relative to the header — correct regardless of which
    // design the header came from, or how many designs reuse the same
    // header) *and* for the case where the header node itself, as it sits
    // in one specific design's root.children, carries its own paintOrder
    // equal to its index in *that* design's root — the value a downstream
    // consumer needs to remember where the header used to sit if it ever
    // extracts that node out of the array entirely.
    paintOrder: siblingIndex,
  };

  // Capture Figma's main-component id, independent of what `type`
  // above collapsed to. Already present on the REST-v1 JSON export this
  // whole tree is built from (api_types.ts's InstanceNode shape) — no
  // extra Figma API call required.
  //
  // Two cases, both need to resolve to the *same* id so an instance and
  // its own main component group together:
  // - INSTANCE nodes carry `componentId`, pointing at their main
  //   component's node id.
  // - The main COMPONENT (or COMPONENT_SET) node itself has no
  //   `componentId` field — it doesn't reference itself — but Figma's
  //   `componentId` on an instance *is* the main component's own `id`. So
  //   a COMPONENT/COMPONENT_SET node self-references its own `id` here.
  //   Found live: a Figma file's "master" page for a component (where the
  //   component is actually defined, not just instanced) holds the real
  //   COMPONENT node, not an INSTANCE — without this, that page's
  //   header/footer wouldn't group with every other page's instances of
  //   the same component, breaking cross-design grouping for exactly the
  //   one design that matters most for defining the part.
  if (node.type === "INSTANCE" && typeof node.componentId === "string") {
    designNode.componentId = node.componentId;
  } else if (
    (node.type === "COMPONENT" || node.type === "COMPONENT_SET") &&
    typeof node.id === "string"
  ) {
    designNode.componentId = node.id;
  }

  if (type === "TEXT") {
    // Only CENTER/RIGHT/JUSTIFIED are ever recorded — LEFT (Figma's
    // most common default) is deliberately omitted rather than captured
    // as an explicit "LEFT" value, matching this schema's general
    // convention of never emitting a value that's already the default.
    const align =
      node.textAlignHorizontal === "CENTER" ||
      node.textAlignHorizontal === "RIGHT" ||
      node.textAlignHorizontal === "JUSTIFIED"
        ? node.textAlignHorizontal
        : undefined;
    designNode.text = {
      segments: mapTextSegments(node, uniqueName, styles),
      ...(align ? { align } : {}),
    };
  }

  if (type === "IMAGE" || type === "VECTOR") {
    // Reuse an already-registered asset for the same underlying node —
    // whether this occurrence is another Instance descendant sharing a
    // masterChildId, or the literal master-Component-definition node
    // itself. See assetIdentityKeyFor's doc comment.
    const identityKey = assetIdentityKeyFor(node.id);
    const existing = assetIdentityMap.get(identityKey);
    if (existing) {
      designNode.assetRef = existing.id;
      return designNode;
    }

    const ext = type === "IMAGE" ? "png" : "svg";
    const fileName = nextAssetFileName(uniqueName, ext);
    const assetId = `asset_${String(assets.length + 1).padStart(2, "0")}`;
    const asset: DesignBundleAsset = {
      id: assetId,
      figmaNodeId: node.id,
      fileName,
      kind: type === "IMAGE" ? "raster" : "vector",
      width: Math.round(node.width ?? 0),
      height: Math.round(node.height ?? 0),
      // Only raster (PNG) exports have a fixed pixel scale relative to
      // `width`/`height` above — see exportDesignBundleAssets. Vector
      // (SVG) assets scale losslessly, so `scale` is left unset for those.
      ...(type === "IMAGE" ? { scale: DESIGN_BUNDLE_RASTER_SCALE } : {}),
    };
    assets.push(asset);
    assetIdentityMap.set(identityKey, asset);
    designNode.assetRef = assetId;
    // IMAGE/VECTOR nodes are treated as leaves — matches the schema's own
    // examples, and avoids emitting redundant child markup for content a
    // downstream consumer would just discard in favor of the exported asset.
    return designNode;
  }

  // This node stayed a FRAME/RECTANGLE (not collapsed to a leaf IMAGE
  // above) specifically because it has real children — see
  // classifyNodeType above. That means it can still have its own image
  // fill sitting *behind* those children (a photographic hero background
  // behind an overlay + heading text, the motivating real case), which
  // style.fills never captures (SOLID/GRADIENT only). Registered as a
  // distinct asset kind — `imageHash` set, not `figmaNodeId`-exportable the
  // normal way — since there's no API to export just this one fill in
  // isolation from a node that also has other content painted on top of it.
  const backgroundFill = findImageFill(node);
  if (backgroundFill && typeof backgroundFill.imageRef === "string") {
    // Same identity-based dedup as the leaf IMAGE/VECTOR branch above
    // — a repeated component instance's own background-image fill (e.g. a
    // Frame background inside a duplicated header/footer) shouldn't be
    // re-registered per Instance either, and neither should the literal
    // master-Component-definition node's own background fill.
    const identityKey = assetIdentityKeyFor(node.id);
    const existing = assetIdentityMap.get(identityKey);
    if (existing) {
      designNode.backgroundAssetRef = existing.id;
    } else {
      const fileName = nextAssetFileName(`${uniqueName}_bg`, "png");
      const assetId = `asset_${String(assets.length + 1).padStart(2, "0")}`;
      // Note: unlike the leaf IMAGE/VECTOR branch above, this asset is
      // resolved via `figma.getImageByHash(...).getBytesAsync()` (see
      // exportDesignBundleAssets), which returns the fill's own raw image
      // bytes as-is — no `exportAsync` SCALE constraint is applied here,
      // so `scale` is intentionally left unset rather than assumed to be 2x.
      const asset: DesignBundleAsset = {
        id: assetId,
        figmaNodeId: node.id,
        fileName,
        kind: "raster",
        width: Math.round(node.width ?? 0),
        height: Math.round(node.height ?? 0),
        imageHash: backgroundFill.imageRef,
      };
      assets.push(asset);
      assetIdentityMap.set(identityKey, asset);
      designNode.backgroundAssetRef = assetId;
    }
  }

  const children = Array.isArray(node.children) ? node.children : [];
  designNode.children = children.map((child: ConvertedNode, index: number) =>
    buildDesignNode(child, assets, styles, layout.mode, index),
  );

  return designNode;
};
