import "@figma/plugin-typings";
// Settings
export type Framework = "Flutter" | "SwiftUI" | "HTML" | "Tailwind" | "Compose";
export interface HTMLSettings {
  showLayerNames: boolean;
  embedImages: boolean;
  embedVectors: boolean;
  useColorVariables: boolean;
  htmlGenerationMode: "html" | "jsx" | "styled-components" | "svelte";
  imagePlaceholderMode?: "remote" | "asset";
}
export interface TailwindSettings extends HTMLSettings {
  tailwindGenerationMode: "html" | "jsx" | "twig";
  roundTailwindValues: boolean;
  roundTailwindColors: boolean;
  useColorVariables: boolean;
  customTailwindPrefix?: string;
  embedVectors: boolean;
  baseFontSize: number;
  useTailwind4: boolean;
  thresholdPercent: number;
  baseFontFamily: string;
  fontFamilyCustomConfig: Record<string, string[]>;
}
export interface FlutterSettings {
  flutterGenerationMode: "fullApp" | "stateless" | "snippet";
}
export interface SwiftUISettings {
  swiftUIGenerationMode: "preview" | "struct" | "snippet";
}
export interface ComposeSettings {
  composeGenerationMode: "snippet" | "composable" | "screen";
}
export interface PluginSettings
  extends
    HTMLSettings,
    TailwindSettings,
    FlutterSettings,
    SwiftUISettings,
    ComposeSettings {
  framework: Framework;
  useOldPluginVersion2025: boolean;
  responsiveRoot: boolean;
}
// Messaging
export interface ConversionData {
  code: string;
  settings: PluginSettings;
  htmlPreview: HTMLPreview;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
}

export type Warning = string;
export type Warnings = Set<Warning>;

export interface Message {
  type: string;
}
export interface UIMessage {
  pluginMessage: Message;
}
export type EmptyMessage = Message & { type: "empty" };
export type ConversionStartMessage = Message & { type: "conversionStarted" };
export type ConversionMessage = Message & {
  type: "code";
} & ConversionData;
export type SettingWillChangeMessage<T> = Message & {
  type: "pluginSettingWillChange";
  key: string;
  value: T;
};
export type SettingsChangedMessage = Message & {
  type: "pluginSettingsChanged";
  settings: PluginSettings;
};
export type ErrorMessage = Message & {
  type: "error";
  error: string;
};
export type DownloadProjectFormat =
  | "flutter"
  | "html"
  | "nextjs"
  | "swiftui"
  | "vite";
export type DownloadProjectMessage = Message & {
  type: "download-project";
  format: DownloadProjectFormat;
};
export type ProjectZipMessage = Message & {
  type: "project-zip";
  zip: ArrayBuffer;
  format: DownloadProjectFormat;
  fileName: string;
};
export type ProjectDownloadErrorMessage = Message & {
  type: "project-download-error";
  error: string;
};

// Design Bundle (Phase 2 — Stage 1 extraction output)
// See docs/03-design-bundle-schema-draft.md in the project knowledge base
// (Design Bundle v1, revised per D14/D15/D17) for the authoritative shape.
// designs[] and DesignNode below are the runtime types this fork's
// serializer produces; keep them in sync with that doc when either changes.
export type DesignBundleFillType = "SOLID" | "GRADIENT" | "OTHER";

// D69 (Phase 5 gradients): the three gradient kinds CSS has a native
// equivalent for. Figma's fourth kind, GRADIENT_DIAMOND, has no CSS
// equivalent (`conic-gradient()` can't reproduce its four-quadrant
// shape) and stays out of scope per Sean's explicit call — a
// DIAMOND-kind paint still gets `DesignBundleFill.hex` (its first
// stop's color, same fallback every gradient kind gets) but no
// `gradient` field, so Stage 2 renders it as a flat color, same
// "narrower gap, logged not fixed" treatment as D18's background-image
// limitation.
export type DesignBundleGradientKind = "LINEAR" | "RADIAL" | "ANGULAR";

export interface DesignBundleGradientStop {
  // 8-digit #RRGGBBAA — this stop's own color with its alpha already
  // combined with the gradient paint's overall `opacity` slider (same
  // "collapse at Stage 1, one number in, one number out" precedent as
  // DesignBundleFill.opacity below / D46), so Stage 2 never needs a
  // separate opacity pass for gradient stops.
  hex: string;
  // 0-1 position along the gradient axis (Figma's own ColorStop.position).
  position: number;
}

export interface DesignBundleGradient {
  kind: DesignBundleGradientKind;
  stops: DesignBundleGradientStop[];
  // Figma's own raw `gradientHandlePositions` (REST API v1 / Plugin API
  // shape), normalized 0-1 within the node's own bounding box, carried
  // through unconverted rather than pre-baked into a CSS angle/radius at
  // Stage 1 — the actual trig lives in Stage 2 (`styleHelpers.ts`'s
  // `gradientToCss`, ported from this fork's existing
  // `html/builderImpl/htmlColor.ts` linear/radial/angular math) so a
  // future non-CSS Gen 2 target isn't stuck consuming a
  // WordPress-specific number. Meaning depends on `kind`: 2 handles
  // (start, end) for LINEAR; 3 (center, x-axis handle, y-axis handle)
  // for RADIAL; 3 (center, unused, start-direction handle) for ANGULAR —
  // matches Figma's own `gradientHandlePositions` doc comment.
  handles: Array<{ x: number; y: number }>;
}

export interface DesignBundleFill {
  type: DesignBundleFillType;
  hex?: string;
  variableRef?: string;
  // D46: this fill's own *combined* opacity — Figma's `paint.color.a`
  // (alpha baked into the color itself) and `paint.opacity` (the paint's
  // separate "opacity" slider) are two distinct fields that blend
  // together (Figma's own doc comment on Paint.opacity: "colors within
  // the paint can also have opacity values which would blend with
  // this"), so they're collapsed into one number here at Stage 1 rather
  // than carried as two — there's no meaningful reason for a Stage 2
  // consumer to ever want them separately, they represent the same
  // "how see-through is this fill" concept. Omitted (undefined) when
  // fully opaque (1), matching this schema's existing sparse-field
  // convention (e.g. `layout.position`). Deliberately NOT collapsed
  // together with the node's own `style.opacity` below — that's a
  // different, non-collapsible axis (see that field's comment).
  // For a GRADIENT fill this is always undefined — each stop already
  // carries its own combined alpha (see DesignBundleGradientStop.hex
  // above), so there's no single opacity number left to apply on top.
  opacity?: number;
  // D69: present only when `type === "GRADIENT"` and Figma's paint kind
  // is one of the three CSS can represent (LINEAR/RADIAL/ANGULAR).
  // DIAMOND-kind (and any future unrecognized gradient kind) omits this
  // and falls back to `hex` only.
  gradient?: DesignBundleGradient;
}
export interface DesignBundleStroke {
  hex: string;
  weight: number;
}
export interface DesignBundleEffect {
  type: string;
  x?: number;
  y?: number;
  blur?: number;
  hex?: string;
  // D70 (Phase 5 shadows/effects): DROP_SHADOW/INNER_SHADOW only — Figma's
  // own `spread` (expands a drop shadow / contracts an inner shadow;
  // undefined defaults to 0, same as Figma's own default). Maps directly
  // to CSS box-shadow's spread-radius value with no conversion — the
  // sign/growth semantics already match (D70's log entry has the detail).
  spread?: number;
}
// D72 (Phase 5 blend modes, last of three long-tail items): the 13 of
// Figma's 18 blend modes CSS `mix-blend-mode` has a native keyword for —
// a plain kebab-case rename in every case (MULTIPLY -> "multiply", etc.).
// PASS_THROUGH/NORMAL are deliberately absent: both mean "no blending,"
// so `DesignBundleNodeStyle.blendMode` is left undefined for them rather
// than modeled as a value (same sparse-field convention as `opacity`).
// LINEAR_BURN and LINEAR_DODGE are also absent — CSS has no equivalent
// (they're a different blend formula than color-burn/color-dodge, not
// just a naming difference) — same "narrower gap, logged not fixed"
// precedent as D18/D69's GRADIENT_DIAMOND.
export type DesignBundleBlendMode =
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface DesignBundleNodeStyle {
  fills: DesignBundleFill[];
  strokes: DesignBundleStroke[];
  cornerRadius: number;
  effects: DesignBundleEffect[];
  // D46: the *node's own* layer opacity (Figma's `node.opacity`, the
  // "Opacity" field in the right-hand panel for the whole layer) —
  // distinct from any individual fill's opacity above. This affects the
  // node's entire rendered result as a group: background, strokes, text,
  // every descendant — not just one fill layer. A node can legitimately
  // have both a translucent fill *and* fully-opaque child content sitting
  // on top of it (e.g. a card with a dimmed background but readable
  // text); collapsing this into a per-fill alpha would incorrectly fade
  // that content too, which real Figma rendering never does. Maps to CSS
  // `opacity` on the node's own wrapping element, not a color-channel
  // adjustment. Omitted (undefined) when fully opaque (1).
  opacity?: number;
  // D72: the *node's own* Blending mode (Figma's `node.blendMode`, same
  // right-hand-panel struct as `opacity` above, `HasBlendModeAndOpacityTrait`
  // in the REST API v1 shape) — scoped deliberately to this one node-level
  // field, not per-fill or per-effect blend modes (Figma also allows a
  // blend mode on an individual paint or shadow effect, a much rarer,
  // finer-grained case left out of scope here — same "narrower gap"
  // treatment). Maps to CSS `mix-blend-mode` on the node's own wrapping
  // element. Omitted (undefined) for PASS_THROUGH/NORMAL (no blending)
  // and for LINEAR_BURN/LINEAR_DODGE (no CSS equivalent).
  blendMode?: DesignBundleBlendMode;
}
export type DesignBundleSizeValue = "fill" | "hug" | number;
export interface DesignBundleLayout {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlign: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlign: "MIN" | "CENTER" | "MAX" | "BASELINE";
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  sizing: { width: DesignBundleSizeValue; height: DesignBundleSizeValue };
  // Populated only when the *parent* frame's layout.mode is "NONE" (i.e. the
  // parent uses absolute positioning) — see D18 in the decisions log for why
  // this diverges from a literal reading of the schema draft.
  position?: { x: number; y: number };
  // D59: Figma's Auto Layout "wrap" (`layoutWrap: "WRAP"`) — a real,
  // distinct layout mechanism from `position` above, found via the
  // Product Detail page's related-products grid: six fixed-width cards
  // in a fixed-width HORIZONTAL container, with no absolute positioning
  // at all (initially mistaken for one — see D58 — before Sean traced
  // the real Figma mechanism directly). CSS's `flex-wrap: wrap` is the
  // literal equivalent; only ever true, mirroring D55's convention of
  // never recording the non-default case (`NO_WRAP`) explicitly.
  wrap?: boolean;
  // Figma's `counterAxisSpacing` — the gap between wrapped *rows/tracks*,
  // distinct from `gap` above (which is the item gap along the main
  // axis). Only meaningful, and only ever populated, when `wrap` is true.
  // Maps to CSS `gap`'s row-gap component (`gap: {rowGap}px {gap}px`)
  // rather than reusing `gap` for both axes, in case a design's item
  // spacing and row spacing genuinely differ.
  rowGap?: number;
}
export interface DesignBundleTextSegment {
  uniqueId: string;
  characters: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  letterSpacing: number;
  textCase: string;
  textDecoration: string;
  // Figma's named text style id for this run, when the run has one applied.
  // Resolves via bundle.styles.textStyles[textStyleId] -> DesignBundleTextStyle.
  // Populated per D23 — the primary heading/paragraph signal Stage 2 uses,
  // ahead of the fontSize/fontWeight fallback heuristic.
  textStyleId?: string;
  // Text fill color. `fillHex` is always populated when the run has a
  // solid fill at all (the literal resolved color); `fillRef` is only set
  // when that fill is bound to a Figma variable. Previously only fillRef
  // was captured, which silently dropped color for any text run using a
  // plain, non-variable-bound color — the common case. Both now mirror
  // DesignBundleFill's hex+variableRef pairing (mapFill in
  // designBundleTree.ts) rather than introducing a different shape.
  fillHex?: string;
  fillRef?: string;
  // D46: mirrors DesignBundleFill.opacity (same combined color.a * paint.opacity
  // calculation, via the same mapFill/fillOpacity path) — a text run's own
  // fill can be translucent same as any other fill. Omitted when opaque.
  fillOpacity?: number;
}
export type DesignNodeType = "FRAME" | "TEXT" | "IMAGE" | "VECTOR" | "RECTANGLE";
export interface DesignNode {
  id: string;
  uniqueName: string;
  type: DesignNodeType;
  layout: DesignBundleLayout;
  style: DesignBundleNodeStyle;
  // D55: Figma's `textAlignHorizontal`, node-level (not per-run — Figma
  // models horizontal alignment as a property of the whole TEXT node, not
  // individual styled runs, unlike fontFamily/fontSize/etc. above).
  // Omitted entirely — not just set to "LEFT" — when Figma's own value is
  // "LEFT", since that's the CSS default and Stage 2 skips emitting a
  // redundant `text-align: left` the same way it already skips other
  // default-valued declarations elsewhere. This project's Design Bundle
  // schema never captured this at all before D55 — confirmed via direct
  // code search, not assumed — a genuine, previously-latent capture gap,
  // not a regression from any prior Phase 5 fix.
  text?: { segments: DesignBundleTextSegment[]; align?: "CENTER" | "RIGHT" | "JUSTIFIED" };
  assetRef?: string;
  // Figma's main-component id, present when this node was originally an
  // INSTANCE (already available synchronously on the REST-v1 JSON export
  // Stage 1 already uses — no extra API call needed). Populated regardless
  // of what `type` above collapses to (INSTANCE always maps to FRAME/
  // RECTANGLE here, same as any other frame — see classifyNodeType).
  // Used by Stage 2 (D22) to identify header/footer Template Part
  // candidates via real component identity rather than layer-name matching
  // (which D14 already rejected as too fragile).
  componentId?: string;
  // D47: this node's index among its original parent's children, at the
  // point Stage 1 walked the tree — i.e. Figma's own paint/z-order
  // (confirmed repeatedly this project: `children[]` array order *is*
  // paint order, not visual position — see D35/D43). Captured as an
  // explicit field, independent of this node's *current* position in any
  // `children[]` array, specifically so it survives a node being pulled
  // out of that array entirely — the header/footer Template Part
  // extraction case (`classifyTemplateParts`/`pruneTemplatePartChildren`
  // in Stage 2's `templateParts.ts`/`generateThemeFiles.ts`), where a
  // node that used to be "child 3 of the root" becomes the independent
  // root of its own separate render context and has no `children[]`
  // membership at all to infer order from anymore. Without this, Stage 2
  // has no way to know a header was originally *above or below* some
  // other now-unrelated sibling in paint order once they're split into
  // separate template files (D45's punted header/hero overlap case).
  // Root `designs[].root` entries have no real parent/siblings within the
  // bundle, so this is omitted (undefined) there — same convention as
  // `layout.position` being root-conditional.
  //
  // Deliberately a plain ordinal (0 = painted first/bottommost in normal
  // top-down z stacking), not a pre-computed CSS z-index — keeping Stage 2
  // free to decide its own sign/offset convention (e.g. `z-index:
  // {paintOrder}` or `-{paintOrder}`) rather than baking a
  // WordPress/CSS-specific decision into the target-neutral bundle (D17).
  paintOrder?: number;
  // D51: a FRAME/RECTANGLE's own background *image* fill — distinct from
  // `assetRef` (leaf IMAGE/VECTOR nodes, where the exported asset *is*
  // the node's entire visual content) and distinct from `style.fills`
  // (which only ever models SOLID/GRADIENT paints, never IMAGE — see
  // `classifyNodeType`'s doc comment in designBundleTree.ts, D18). A node
  // with both an image fill *and* real children stays a FRAME so its
  // children survive as separate, editable content (D18's fix), but that
  // left the background image itself uncaptured entirely — confirmed as
  // a real, concrete gap on a real bundle: a "Dimmer" overlay (D44) sits
  // in front of a photographic hero background that never made it into
  // the bundle at all. Resolves the same way `assetRef` does — via
  // `bundle.assets[]`, keyed by this id — Stage 2 renders it as a CSS
  // `background-image`, layered under any `style.fills` background-color
  // (and under any real children rendered on top, same as Figma's own
  // paint order for this exact configuration).
  backgroundAssetRef?: string;
  children: DesignNode[];
}
export interface DesignBundleAsset {
  id: string;
  figmaNodeId: string;
  fileName: string;
  kind: "raster" | "vector";
  width: number;
  height: number;
  // D51: present only for a background-image asset (referenced via a
  // DesignNode's `backgroundAssetRef`, not `assetRef`). Figma has no API
  // to export "just this one fill" from a node that also has other
  // visual content (children) painted on top of it — calling the usual
  // `node.exportAsync()` on the *containing* frame would flatten those
  // children into the raster too, which is exactly what D18 fixed by
  // keeping such a frame's children as separate, real content instead of
  // a flattened image. `imageHash` is the paint's own image reference
  // (Figma REST API v1 calls this `imageRef`; the Plugin API's
  // `getImageByHash` accepts the same underlying value) — resolving the
  // fill's raw bytes directly, independent of whatever else the
  // containing node renders.
  imageHash?: string;
}
export interface DesignBundleColorStyle {
  name: string;
  hex: string;
}
export interface DesignBundleTextStyle {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
}
export interface DesignBundleStyles {
  colors: Record<string, DesignBundleColorStyle>;
  textStyles: Record<string, DesignBundleTextStyle>;
}
export interface DesignBundleDesign {
  figmaNodeId: string;
  layerName: string;
  root: DesignNode;
}
export interface DesignBundleMeta {
  figmaFileKey: string;
  figmaFileName: string;
  figmaPageName: string;
  exportedAt: string;
  exportedBy: string;
  sourceTool: string;
}
export interface DesignBundle {
  schemaVersion: 1;
  meta: DesignBundleMeta;
  designs: DesignBundleDesign[];
  assets: DesignBundleAsset[];
  styles: DesignBundleStyles;
}
export type ExportDesignBundleMessage = Message & {
  type: "export-design-bundle";
};
export type DesignBundleZipMessage = Message & {
  type: "design-bundle-zip";
  zip: ArrayBuffer;
  fileName: string;
  designCount: number;
  assetCount: number;
  warnings: string[];
};
export type DesignBundleErrorMessage = Message & {
  type: "design-bundle-error";
  error: string;
};

// Nodes
export type ParentNode = BaseNode & ChildrenMixin;

export type AltNodeMetadata<T extends BaseNode> = {
  originalNode: T;
  canBeFlattened: boolean;
  svg?: string;
  base64?: string;
};
export type AltNode<T extends BaseNode> = T & AltNodeMetadata<T>;

export type ExportableNode = SceneNode & ExportMixin & MinimalFillsMixin;

// Styles & Conversions

export type LayoutMode =
  | ""
  | "Absolute"
  | "TopStart"
  | "TopCenter"
  | "TopEnd"
  | "CenterStart"
  | "Center"
  | "CenterEnd"
  | "BottomStart"
  | "BottomCenter"
  | "BottomEnd";

export interface BoundingRect {
  x: number;
  y: number;
}

interface AllSides {
  all: number;
}
interface Sides {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
interface Corners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}
interface HorizontalAndVertical {
  horizontal: number;
  vertical: number;
}

export type PaddingType = Sides | AllSides | HorizontalAndVertical;
export type BorderSide = AllSides | Sides;
export type CornerRadius = AllSides | Corners;

export type SizeValue = number | "fill" | null;
export interface Size {
  readonly width: SizeValue;
  readonly height: SizeValue;
}

export type StyledTextSegmentSubset = Omit<
  StyledTextSegment,
  "listSpacing" | "paragraphIndent" | "paragraphSpacing" | "textStyleOverrides"
>;

export type FontWeightNumber =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type ColorSpec = {
  source: string;
  rgb: RGB;
};

export type SolidColorConversion = {
  hex: string;
  colorName: string;
  exportValue: string;
  contrastWhite: number;
  contrastBlack: number;
  meta?: string;
};
export type LinearGradientConversion = {
  cssPreview: string;
  exportValue: string;
};

// Framework Specific

export interface HTMLPreview {
  size: { width: number; height: number };
  content: string;
}

export interface TailwindTextConversion {
  name: string;
  attr: string;
  full: string;
  style: string;
  contrastBlack: number;
}

export type TailwindColorType = "text" | "bg" | "border" | "outline";

export type SwiftUIModifier = [
  string,
  string | SwiftUIModifier | SwiftUIModifier[],
];

// UI

export interface PreferenceOptions {
  itemType: string;
  label: string;
  propertyName: string;
  includedLanguages?: Framework[];
}
export interface SelectPreferenceOptions extends PreferenceOptions {
  itemType: "select";
  propertyName: Exclude<keyof PluginSettings, "framework">;
  options: { label: string; value: string; isDefault?: boolean }[];
}

export interface LocalCodegenPreferenceOptions extends PreferenceOptions {
  itemType: "individual_select";
  propertyName: Exclude<
    keyof PluginSettings,
    "framework" | "flutterGenerationMode" | "swiftUIGenerationMode"
  >;
  description: string;
  value?: boolean;
  isDefault?: boolean;
}
