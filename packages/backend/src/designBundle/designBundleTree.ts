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
} from "types";
import { commonLetterSpacing, commonLineHeight } from "../common/commonTextHeightSpacing";

// The tree produced by `nodesToJSON` (packages/backend/src/altNodes/jsonNodeConversion.ts)
// is a standard Figma REST API v1 `Node` (packages/backend/src/api_types.ts) plus the
// AltNode extras documented in 03-design-bundle-schema-draft.md (`x/y/width/height`,
// `uniqueName`, `cumulativeRotation`, `canBeFlattened`, `styledTextSegments`). There is no
// single exported type for that combination, so we work against a loosely-typed shape here
// rather than fighting the type system — consistent with how the rest of the backend
// (code.ts, jsonNodeConversion.ts) already treats `convertedSelection` as `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// D63: primary asset-dedup mechanism — keyed on the node's identity *within
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

// D63: Figma's REST API v1 (what nodesToJSON's whole tree is built from —
// see the ConvertedNode comment above) gives every node *inside* an
// Instance an id of the shape `I{instanceId};{masterChildId}` — confirmed
// directly against real exported bundles (e.g. `I2011:161;1:1468`). The
// part after the first semicolon is that node's own id *inside the master
// Component definition*, and is identical across every Instance of that
// component regardless of which design placed it — Figma's node-id space is
// unique file-wide, so this substring alone (no separate componentId lookup
// needed) already uniquely identifies "the same original node." A node
// that's directly part of a design's own tree (not inside any Instance) has
// a plain id with no semicolon and never matches — always exported fresh,
// unchanged from pre-D63 behavior.
//
// Deliberately identity-based, not content-based: Stage 2 has a separate,
// secondary content-hash pass (`loadBundle.ts`) for anything this doesn't
// explain. This only recognizes "the same node position inside the same
// component," and — per Sean's explicit call — assumes no per-instance
// content overrides on shared header/footer content. A real override would
// currently dedupe silently wrong; revisit if that assumption ever proves
// false in practice.
const INSTANCE_DESCENDANT_ID = /^I[^;]+;(.+)$/;
const assetIdentityKeyFor = (nodeId: string): string | undefined =>
  INSTANCE_DESCENDANT_ID.exec(nodeId)?.[1];

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

const rgbaToHex8 = (color: { r: number; g: number; b: number; a?: number }): string => {
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
  return fills.find((fill: any) => fill?.type === "IMAGE" && fill.visible !== false);
};

const hasImageFill = (node: ConvertedNode): boolean => findImageFill(node) !== undefined;

const hasRealChildren = (node: ConvertedNode): boolean =>
  Array.isArray(node.children) && node.children.length > 0;

const classifyNodeType = (node: ConvertedNode): DesignNodeType => {
  if (node.type === "TEXT") return "TEXT";
  if (VECTOR_LIKE_TYPES.has(node.type)) return "VECTOR";
  // Only collapse an image-filled node to a flattened IMAGE leaf when it has
  // no real children. Originally this collapsed *any* image-filled node
  // regardless of children — validated against a synthetic "hero banner with
  // an overlaid heading" fixture during Phase 2 and found to silently drop
  // the heading, a real content-loss bug (see decisions log D18). A frame
  // with both an image fill and child content now stays a FRAME so its
  // children survive; the background image itself is still not
  // representable in style.fills (schema only models solid/gradient fills)
  // — that narrower gap is left as a Phase 5 long-tail item.
  if (hasImageFill(node) && !hasRealChildren(node)) return "IMAGE";
  if (node.type === "RECTANGLE" || node.type === "ELLIPSE") return "RECTANGLE";
  return "FRAME";
};

const resolveCornerRadius = (node: ConvertedNode): number => {
  if (typeof node.cornerRadius === "number") return node.cornerRadius;
  if (Array.isArray(node.rectangleCornerRadii)) {
    const [topLeft, topRight, bottomRight, bottomLeft] = node.rectangleCornerRadii;
    if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft) {
      return topLeft ?? 0;
    }
    // Schema v1 only carries a single cornerRadius number (see D18) — non-uniform
    // corners are approximated by their largest corner rather than dropped.
    return Math.max(topLeft ?? 0, topRight ?? 0, bottomRight ?? 0, bottomLeft ?? 0);
  }
  if (typeof node.topLeftRadius === "number") {
    return Math.max(
      node.topLeftRadius ?? 0,
      node.topRightRadius ?? 0,
      node.bottomRightRadius ?? 0,
      node.bottomLeftRadius ?? 0,
    );
  }
  return 0;
};

// D46: Figma's `paint.color.a` (alpha baked into the fill's own color) and
// `paint.opacity` (the fill's separate "opacity" slider) are two distinct
// fields that blend together — Figma's own doc comment on Paint.opacity:
// "colors within the paint can also have opacity values which would blend
// with this" — so they're combined into one effective alpha here, at the
// point of capture, rather than carried through as two separate numbers
// with no real Stage-2 use for keeping them apart. `undefined` (not just
// `1`) is treated as "fully opaque" for both, matching Figma's own default.
const fillOpacity = (paint: any): number | undefined => {
  const colorAlpha = typeof paint.color?.a === "number" ? paint.color.a : 1;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  const combined = colorAlpha * paintOpacity;
  return combined < 1 ? combined : undefined;
};

// D69 (Phase 5 gradients): the three gradient kinds CSS can render
// natively. GRADIENT_DIAMOND is deliberately absent — no CSS equivalent,
// Sean's explicit call to leave it collapsed to a flat fallback color
// rather than approximate it.
const GRADIENT_KIND_BY_PAINT_TYPE: Record<string, "LINEAR" | "RADIAL" | "ANGULAR"> = {
  GRADIENT_LINEAR: "LINEAR",
  GRADIENT_RADIAL: "RADIAL",
  GRADIENT_ANGULAR: "ANGULAR",
};

// D69: structured gradient data (stops + Figma's own raw handle geometry,
// unconverted — see DesignBundleGradient's doc comment in types.ts for why
// the trig stays out of Stage 1). Returns undefined for GRADIENT_DIAMOND,
// any unrecognized gradient kind, or if Figma's own gradientStops/
// gradientHandlePositions are missing on this paint — mapFill's caller
// still gets a flat `hex` fallback in every case via the first stop.
const mapGradient = (paint: any): DesignBundleGradient | undefined => {
  const kind = GRADIENT_KIND_BY_PAINT_TYPE[paint.type as string];
  if (!kind) return undefined;
  const stops = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
  const handles = Array.isArray(paint.gradientHandlePositions) ? paint.gradientHandlePositions : [];
  if (stops.length === 0 || handles.length === 0) return undefined;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  return {
    kind,
    stops: stops.map((stop: any) => ({
      hex: rgbaToHex8({ ...(stop.color ?? {}), a: (stop.color?.a ?? 1) * paintOpacity }),
      position: typeof stop.position === "number" ? stop.position : 0,
    })),
    handles: handles.map((handle: any) => ({ x: handle?.x ?? 0, y: handle?.y ?? 0 })),
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
    // D69: always carry a flat-color fallback — the first stop's own
    // color, with its alpha already combined with the paint's overall
    // opacity, as an 8-digit hex so no separate `opacity` field is
    // needed on the fallback either. Covers GRADIENT_DIAMOND and any
    // future gradient kind Stage 2 can't render as real CSS. Previously
    // this branch produced no `hex` at all, so any gradient-filled node
    // rendered with *no* background whatsoever — this fixes that gap too,
    // not just the LINEAR/RADIAL/ANGULAR cases.
    const firstStopColor = Array.isArray(paint.gradientStops) ? paint.gradientStops[0]?.color : undefined;
    const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    const fallbackHex = firstStopColor
      ? rgbaToHex8({ ...firstStopColor, a: (firstStopColor.a ?? 1) * paintOpacity })
      : undefined;
    return {
      type: "GRADIENT",
      hex: fallbackHex,
      variableRef: variableId,
      gradient: mapGradient(paint),
    };
  }

  return { type: "OTHER", variableRef: variableId, opacity: fillOpacity(paint) };
};

const mapStrokes = (node: ConvertedNode) => {
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  const weight = typeof node.strokeWeight === "number" ? node.strokeWeight : 1;
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
          // D70: only meaningful for shadows — Figma's own `spread`,
          // already present on the raw effect object, just wasn't carried
          // through before (Stage 2 didn't consume `style.effects` at
          // all pre-D70, so there was nothing to wire it to yet).
          spread: typeof effect.spread === "number" ? effect.spread : undefined,
        };
      }
      return { type: effect.type, blur: effect.radius ?? 0 };
    });
};

// D46: the node's own layer opacity (`HasBlendModeAndOpacityTrait.opacity`
// in the REST API v1 shape — every node type carries this), distinct from
// any individual fill's opacity above (see DesignBundleNodeStyle.opacity's
// doc comment in types.ts for why these aren't collapsed together).
// `undefined`/missing is Figma's own default for "fully opaque."
const nodeOpacity = (node: ConvertedNode): number | undefined => {
  const value = typeof node.opacity === "number" ? node.opacity : 1;
  return value < 1 ? value : undefined;
};

// D72: Figma's 18 `BlendMode` values -> the 13 CSS `mix-blend-mode` has a
// native keyword for. PASS_THROUGH/NORMAL map to `undefined` (no
// blending, same as this schema's other sparse-field opacity/gradient
// conventions) rather than being listed here with no value — they're
// absent from this table entirely, so the fallthrough `undefined` return
// below covers them along with LINEAR_BURN/LINEAR_DODGE (no CSS
// equivalent) and any future/unrecognized blend mode.
const CSS_BLEND_MODE_BY_FIGMA_BLEND_MODE: Record<string, DesignBundleBlendMode> = {
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
  COLOR_DODGE: "color-dodge",
  COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light",
  SOFT_LIGHT: "soft-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
};

const nodeBlendMode = (node: ConvertedNode): DesignBundleBlendMode | undefined => {
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

const sizingValue = (
  sizingMode: string | undefined,
  fixedValue: number | undefined,
): "fill" | "hug" | number => {
  if (sizingMode === "FILL") return "fill";
  if (sizingMode === "HUG") return "hug";
  return typeof fixedValue === "number" ? Math.round(fixedValue) : 0;
};

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
    // source node's style actually varies at the run level).
    const fallbackFill = mapFill(node.fills?.[0], styles);
    return [
      {
        uniqueId: `${uniqueName}_span`,
        characters: node.characters ?? "",
        fontFamily: node.style?.fontFamily ?? "",
        fontSize: node.style?.fontSize ?? 0,
        fontWeight: String(node.style?.fontWeight ?? "400"),
        lineHeight: 0,
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
      uniqueId: `${uniqueName}_span_${index}`,
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
      // (jsonNodeConversion.ts) — just wasn't threaded through until D23.
      textStyleId: segment.textStyleId || undefined,
    };
  });
};

// Wrapped so a malformed/unexpected LineHeight or LetterSpacing shape
// (e.g. from a node that isn't a real live Figma TEXT node, seen while
// testing against non-Auto-Layout content per D16) degrades to 0 instead
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
 * Bundle `DesignNode` tree, per docs/03-design-bundle-schema-draft.md.
 * Mutates `assets` and `styles` as it walks, collecting exactly what D9/D13
 * require: an assets manifest for IMAGE/VECTOR leaves, and a resolved
 * colors dictionary for anything bound to a Figma variable.
 */
export const buildDesignNode = (
  node: ConvertedNode,
  assets: DesignBundleAsset[],
  styles: DesignBundleStyles,
  parentLayoutMode: string | undefined,
  // D47: this node's index among its original parent's children (Figma's
  // paint/z-order — see the `paintOrder` field doc in types.ts). Only the
  // recursive call site below passes this; the root call
  // (designBundleMain.ts) omits it, since a `designs[].root` entry has no
  // real siblings within the bundle.
  siblingIndex?: number,
): DesignNode => {
  const uniqueName: string = node.uniqueName ?? node.name ?? node.id;
  const type = classifyNodeType(node);

  const layout: DesignNode["layout"] = {
    mode: (node.layoutMode as any) ?? "NONE",
    primaryAxisAlign: (node.primaryAxisAlignItems as any) ?? "MIN",
    counterAxisAlign: (node.counterAxisAlignItems as any) ?? "MIN",
    gap: node.itemSpacing ?? 0,
    padding: {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    },
    sizing: {
      width: sizingValue(node.layoutSizingHorizontal, node.width),
      height: sizingValue(node.layoutSizingVertical, node.height),
    },
  };
  // D59: Figma's Auto Layout wrap — `NO_WRAP` (the default) is never
  // recorded, matching D55's convention for default-valued fields.
  // `counterAxisSpacing` (row gap) only has real meaning when wrap is on.
  if (node.layoutWrap === "WRAP") {
    layout.wrap = true;
    if (typeof node.counterAxisSpacing === "number") {
      layout.rowGap = node.counterAxisSpacing;
    }
  }
  // Position carries meaning when either the *parent* lays its children out
  // freely (mode NONE), or this specific node opts out of its parent's Auto
  // Layout flow (`layoutPositioning: "ABSOLUTE"`, Figma's per-child escape
  // hatch available even inside a HORIZONTAL/VERTICAL auto-layout parent).
  // The first version of this check only looked at the parent's overall
  // mode and silently dropped x/y for absolutely-positioned children of an
  // auto-layout frame — caught by a synthetic "decorative blob inside a
  // vertical form" fixture during Phase 2 (see decisions log D18). Root
  // designs[] entries have no parent, so position is always included there.
  const isAbsoluteInAutoLayout = node.layoutPositioning === "ABSOLUTE";
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
    // D47: index within *this specific call's* parent — i.e. relative to
    // whatever `node`'s immediate parent was at the point Stage 1 walked
    // it. Never a global/whole-tree counter. That single, uniform rule is
    // what makes this work correctly both for a Template Part's own
    // internal children (e.g. a header's logo/nav/button get 0/1/2,
    // relative to the header — correct regardless of which design the
    // header came from, or how many designs reuse the same header) *and*
    // for the "socket" case (the header node itself, as it sits in one
    // specific design's root.children, carries its own paintOrder equal
    // to its index in *that* design's root — the exact value Stage 2
    // needs to remember where the header used to sit once it extracts
    // that node out of the array entirely).
    paintOrder: siblingIndex,
  };

  // D22: capture Figma's main-component id, independent of what `type`
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
  //   the same component, breaking D22's cross-design majority vote for
  //   exactly the one design that matters most for defining the part.
  if (node.type === "INSTANCE" && typeof node.componentId === "string") {
    designNode.componentId = node.componentId;
  } else if (
    (node.type === "COMPONENT" || node.type === "COMPONENT_SET") &&
    typeof node.id === "string"
  ) {
    designNode.componentId = node.id;
  }

  if (type === "TEXT") {
    // D55: only CENTER/RIGHT/JUSTIFIED are ever recorded — LEFT (Figma's
    // most common default) is deliberately omitted rather than captured
    // as an explicit "LEFT" value, matching Stage 2's existing convention
    // of never emitting a CSS declaration for a value that's already the
    // browser default.
    const align =
      node.textAlignHorizontal === "CENTER" ||
      node.textAlignHorizontal === "RIGHT" ||
      node.textAlignHorizontal === "JUSTIFIED"
        ? node.textAlignHorizontal
        : undefined;
    designNode.text = { segments: mapTextSegments(node, uniqueName, styles), ...(align ? { align } : {}) };
  }

  if (type === "IMAGE" || type === "VECTOR") {
    // D63: reuse an already-registered asset for the same master-component
    // node, rather than re-exporting/re-registering an identical copy for
    // every Instance. See assetIdentityKeyFor's doc comment.
    const identityKey = assetIdentityKeyFor(node.id);
    const existing = identityKey ? assetIdentityMap.get(identityKey) : undefined;
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
    };
    assets.push(asset);
    if (identityKey) {
      assetIdentityMap.set(identityKey, asset);
    }
    designNode.assetRef = assetId;
    // IMAGE/VECTOR nodes are treated as leaves — matches the schema draft's
    // examples, and avoids emitting redundant child markup for content
    // Stage 2 would just discard in favor of the exported asset.
    return designNode;
  }

  // D51: this node stayed a FRAME/RECTANGLE (not collapsed to a leaf IMAGE
  // above) specifically because it has real children — classifyNodeType's
  // whole D18 fix. That means it can still have its own image fill sitting
  // *behind* those children (a photographic hero background behind an
  // overlay + heading text, the motivating real case), which style.fills
  // never captures (SOLID/GRADIENT only). Registered as a distinct asset
  // kind — `imageHash` set, not `figmaNodeId`-exportable the normal way —
  // since there's no API to export just this one fill in isolation from a
  // node that also has other content painted on top of it.
  const backgroundFill = findImageFill(node);
  if (backgroundFill && typeof backgroundFill.imageRef === "string") {
    // D63: same identity-based dedup as the leaf IMAGE/VECTOR branch above
    // — a repeated component instance's own background-image fill (e.g. a
    // Frame background inside a duplicated header/footer) shouldn't be
    // re-registered per Instance either.
    const identityKey = assetIdentityKeyFor(node.id);
    const existing = identityKey ? assetIdentityMap.get(identityKey) : undefined;
    if (existing) {
      designNode.backgroundAssetRef = existing.id;
    } else {
      const fileName = nextAssetFileName(`${uniqueName}_bg`, "png");
      const assetId = `asset_${String(assets.length + 1).padStart(2, "0")}`;
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
      if (identityKey) {
        assetIdentityMap.set(identityKey, asset);
      }
      designNode.backgroundAssetRef = assetId;
    }
  }

  const children = Array.isArray(node.children) ? node.children : [];
  designNode.children = children.map((child: ConvertedNode, index: number) =>
    buildDesignNode(child, assets, styles, layout.mode, index),
  );

  return designNode;
};
