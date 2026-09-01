import {
  DesignBundleAsset,
  DesignBundleEffect,
  DesignBundleTextStyle,
  DesignNode,
} from "../core/types/designBundle";
import { GeneratedBlock, MappingWarning } from "./types";
import {
  escapeHtml,
  layoutToDeclarations,
  layoutPositionToDeclarations,
  nodeStyleToDeclarations,
  joinStyles,
  fontFamilyDeclaration,
  withAlpha,
} from "../core/style/styleHelpers";
import { nodeClassFor } from "../core/style/nodeClass";
import { addRule, addPositionRule, Stylesheet } from "../core/style/stylesheet";
import { renderForm } from "./formMapping";
import { renderLink } from "./linkMapping";
import { walkDesignTree, NodeClassification } from "../core/designTree";
import { PublishTarget } from "../targets/target";
import { NamedStyleClass } from "../theme/generateThemeTokens";

/**
 * Image `src` resolution differs by output mode. Theme-mode output lands
 * in a PHP-executed `patterns/*.php` theme file, so it can emit a live
 * `get_stylesheet_directory_uri()` PHP call that resolves correctly on
 * any domain/install path at request time. Patterns-mode output doesn't
 * have that luxury: WordPress's "Import from JSON" on the Patterns screen
 * creates a `wp_block` post whose content is stored, parsed, and rendered
 * as plain block markup — it's never `include`d as a PHP file, so a
 * literal `<?php ... ?>` tag would render as inert text on the front end
 * instead of executing. `"php"` (theme mode) emits the live
 * `get_stylesheet_directory_uri()` call; `"url"` (patterns mode) emits a
 * plain, generation-time-known base URL the caller supplies, since
 * there's no PHP execution available there to resolve one dynamically.
 */
export type ImageSrcMode = { kind: "php" } | { kind: "url"; baseUrl: string };

export interface MapNodeContext {
  /** assets[] indexed by id, per the bundle schema (`asset.id` <-> `DesignNode.assetRef`). */
  assetsById: Map<string, DesignBundleAsset>;
  /** Defaults to `{ kind: "php" }` (theme mode's live-PHP-URL behavior) when omitted. */
  imageSrcMode?: ImageSrcMode;
  /** bundle.styles.textStyles — used by the heading heuristic's "Plan A" named-style match (matching a text run's named Figma style against a heading pattern before falling back to a size heuristic). Defaults to {} for callers that don't have it. */
  textStyles?: Readonly<Record<string, DesignBundleTextStyle>>;
  /** styles.colors' variable id -> theme.json palette slug (generateThemeTokens.ts). When a fill/text-fill's variableRef resolves here, the mapper emits a real WP color preset (backgroundColor/textColor attr + has-{slug}-*-color class) instead of custom CSS. */
  colorSlugByVariableRef?: ReadonlyMap<string, string>;
  /** textStyleId -> theme.json fontSizes slug (generateThemeTokens.ts). When a text run's textStyleId resolves here, the mapper emits a `fontSize` preset attr + has-{slug}-font-size class. */
  fontSizeSlugByTextStyleId?: ReadonlyMap<string, string>;
  /**
   * A CSS-optimization step: textStyleId -> the shared "ts-*" class
   * generated for that named style (generateThemeTokens.ts's
   * buildNamedStyleClasses), plus the resolved style itself. When a text
   * run's textStyleId resolves here, mapText applies the shared class and
   * omits any of family/weight/line-height from its own per-node
   * declarations that match the named style's own values -- an actual
   * per-run override (e.g. bold applied on top of a normally-regular
   * style) still gets its own per-node declaration for just the
   * properties that genuinely diverge.
   */
  namedStyleClassByTextStyleId?: ReadonlyMap<string, NamedStyleClass>;
  /** Accumulates one CSS rule per node that needs custom styling beyond what a WP preset covers — mutated as mapping recurses. */
  stylesheet: Stylesheet;
  warnings: MappingWarning[];
}

export const warn = (
  ctx: MapNodeContext,
  nodeId: string,
  message: string,
): void => {
  ctx.warnings.push({ nodeId, message });
};

/**
 * Everything the mapper claims via JSON attrs must be something
 * WordPress's own `save()` actually reconstructs from those exact attrs —
 * otherwise the block editor reports "unexpected or invalid content" and
 * offers "Attempt Recovery." Custom styling with no real, correctly-
 * round-tripping block attribute (arbitrary widths/gaps/padding, raw
 * non-preset colors, borders, font metrics) goes entirely into a generated
 * per-node CSS class — zero attrs footprint, so there's nothing for
 * save() to get wrong. WP-native presets (textColor/backgroundColor/
 * fontSize) are the only styling still expressed as real attrs, because
 * those genuinely do round-trip correctly.
 */
const mapText = (
  node: DesignNode,
  ctx: MapNodeContext,
  level: number | undefined,
): GeneratedBlock => {
  const segments = node.text?.segments ?? [];
  if (segments.length === 0) {
    warn(
      ctx,
      node.id,
      "TEXT node has no text.segments — rendering an empty paragraph.",
    );
  }
  if (segments.length > 1) {
    warn(
      ctx,
      node.id,
      `TEXT node has ${segments.length} runs — concatenated into plain text without per-run styling (v1 limitation, see 06-block-mapping.md).`,
    );
  }

  const innerHtml = segments.map((s) => escapeHtml(s.characters)).join("");
  const first = segments[0];
  // `level` (the heading classification, based on matching a text run's
  // named Figma style against a heading pattern) is computed once, up
  // front, by core/designTree.ts's classifyNode — passed in rather than
  // recomputed here.

  const textColorSlug = first?.fillRef
    ? ctx.colorSlugByVariableRef?.get(first.fillRef)
    : undefined;
  const fontSizeSlug = first?.textStyleId
    ? ctx.fontSizeSlugByTextStyleId?.get(first.textStyleId)
    : undefined;
  // The named style this run's textStyleId resolves to, if any -- see
  // MapNodeContext.namedStyleClassByTextStyleId's doc comment for how
  // this changes the per-node declarations built below.
  const namedStyle = first?.textStyleId
    ? ctx.namedStyleClassByTextStyleId?.get(first.textStyleId)
    : undefined;

  const presetAttrs: Record<string, unknown> = {};
  if (textColorSlug) presetAttrs.textColor = textColorSlug;
  if (fontSizeSlug) presetAttrs.fontSize = fontSizeSlug;

  // Class order matters here, not just membership. Confirmed against real
  // markup WordPress's own editor generated natively: the slug-specific
  // `has-{slug}-color` class comes *before* the generic `has-text-color`
  // flag class.
  const presetClasses = [
    textColorSlug ? `has-${textColorSlug}-color has-text-color` : undefined,
    fontSizeSlug ? `has-${fontSizeSlug}-font-size` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  // font-size/color only go into our custom class when there's no preset
  // already covering them (avoids redundant/duplicate CSS, and keeps the
  // custom class doing only what the WP presets don't).
  //
  // A TEXT node's captured `sizing.height` (when it's a literal
  // Figma-measured px number, not "hug"/"fill") is never trustworthy as a
  // hard CSS `height` constraint — found on the Product Detail page's
  // related-product cards: a description captured at a fixed 30px (a
  // Figma snapshot sized for however it happened to wrap on Figma's own
  // canvas) rendered as two lines in the browser instead of one — real
  // font-rendering/sub-pixel wrapping differences between Figma and any
  // given browser aren't something this pipeline can guarantee matches.
  // The second line overflowed straight into the next flex sibling below
  // it, since flex spacing is computed from the box's *declared* height,
  // not its actual overflowed content height. Flow text's height should
  // always be intrinsic/content-driven, same as "hug" already produces —
  // forcing a fixed number here is fragile regardless of what Figma's own
  // sizing mode said, unlike width (or a container's height), where an
  // explicit constraint is usually intentional and safe. Width is left
  // untouched; only height is forced to "hug" semantics, and only for
  // this text-specific declarations call.
  const textLayout =
    typeof node.layout.sizing.height === "number"
      ? {
          ...node.layout,
          sizing: { ...node.layout.sizing, height: "hug" as const },
        }
      : node.layout;
  //
  // Leaf TEXT nodes previously got zero layout CSS at all —
  // layoutToDeclarations was only ever called from mapContainer, so a text
  // node's own sizing (fill/hug/explicit px) and absolute layout.position
  // (see styleHelpers.ts) were silently dropped. Merged in here too, same
  // as mapImageLike below, so leaf nodes reproduce Figma sizing/placement
  // consistently with containers.
  // A text run's own fillOpacity blends into its color the same way any
  // other fill's opacity does (withAlpha); the TEXT node's own
  // `style.opacity` is a separate value that affects the whole node, so
  // it's applied standalone rather than folded into the color.
  const customDeclarations = joinStyles(
    layoutToDeclarations(textLayout),
    first
      ? joinStyles(
          // Omitted when it matches namedStyle's own family -- see
          // MapNodeContext.namedStyleClassByTextStyleId's doc comment.
          namedStyle && namedStyle.style.fontFamily === first.fontFamily
            ? undefined
            : `font-family: ${fontFamilyDeclaration(first.fontFamily)}`,
          fontSizeSlug ? undefined : `font-size: ${first.fontSize}px`,
          // Omitted when it matches namedStyle's own weight.
          namedStyle && namedStyle.style.fontWeight === first.fontWeight
            ? undefined
            : `font-weight: ${first.fontWeight}`,
          // `first.lineHeight` is a unitless *ratio* (designBundleTree.ts's
          // mapTextSegments deliberately computes `lineHeightPx / fontSize`,
          // e.g. `1.5`, not a raw px value) — a bare number here is
          // correct, idiomatic CSS (`line-height: 1.5` means 1.5x
          // font-size, and scales properly if font-size ever changes,
          // unlike a fixed px value would). An earlier version of this
          // code wrongly assumed this was already in pixels and appended
          // `px`, which turned a real `1.5` into a near-zero `1.5px` —
          // collapsing every paragraph's lines into each other; that part
          // was reverted. `commonLineHeight` (in
          // commonTextHeightSpacing.ts) returns a literal `0` for Figma's
          // "Auto" line-height (no real ratio to report) — emitting that
          // unconditionally as `line-height: 0` creates strongly negative
          // half-leading, visibly shifting the rendered glyph upward out
          // of its own box (dramatic on large headings, easy to miss on
          // small body text). Still omitted entirely when 0, letting the
          // browser's own `line-height: normal` apply — the real semantic
          // equivalent of Figma's "Auto."
          // Also omitted when it matches namedStyle's own line-height
          // (same reasoning as family/weight above).
          namedStyle && namedStyle.style.lineHeight === first.lineHeight
            ? undefined
            : first.lineHeight
              ? `line-height: ${first.lineHeight}`
              : undefined,
          textColorSlug || !first.fillHex
            ? undefined
            : `color: ${withAlpha(first.fillHex, first.fillOpacity)}`,
        )
      : undefined,
    node.style.opacity !== undefined
      ? `opacity: ${node.style.opacity}`
      : undefined,
    // TEXT nodes build their own declarations here rather than going
    // through `nodeStyleToDeclarations` (containers only) — same reason
    // the opacity line just above is duplicated instead of shared.
    node.style.blendMode !== undefined
      ? `mix-blend-mode: ${node.style.blendMode}`
      : undefined,
    // Figma's textAlignHorizontal — Stage 1 only ever records
    // CENTER/RIGHT/JUSTIFIED (LEFT is the CSS default, so it's never
    // captured at all — see designBundleTree.ts). This pipeline never
    // emitted `text-align` for any TEXT node before this; it was simply
    // a missing capability, not a regression.
    node.text?.align
      ? `text-align: ${node.text.align.toLowerCase()}`
      : undefined,
  );
  const nodeClass = nodeClassFor(node.id);
  // "paragraph" vs "heading" as the dedup kind here, not just "text" —
  // coarser than per-level (level is already a real WP attr, never at
  // risk of being lost by two different levels sharing a look-only rule;
  // a future pass could split further into a generic "heading" rule plus
  // a per-level size rule, mirroring how hand-written CSS usually
  // separates a shared `h1,h2,h3{...}` block from each level's own
  // font-size — flagged as a nice-to-have, not attempted here). Position
  // is split into its own, always per-node rule via addPositionRule — see
  // layoutPositionToDeclarations's doc comment for why it's never
  // deduped.
  const lookClass = addRule(
    ctx.stylesheet,
    level !== undefined ? "heading" : "paragraph",
    nodeClass,
    customDeclarations,
  );
  const positionClass = addPositionRule(
    ctx.stylesheet,
    `${nodeClass}-pos`,
    layoutPositionToDeclarations(textLayout, node.paintOrder),
  );
  // namedStyle's shared class sits between the (possibly shared) look
  // class and the always-per-node position class -- render order in the
  // stylesheet (named-style classes are all registered up front, before
  // any node is mapped -- see generateThemeFiles.ts) means this class's
  // declarations always come *before* lookClass's in style.css, so a
  // genuinely-diverging per-node declaration in lookClass (an exception
  // the checks above left in) correctly wins the cascade over this
  // shared baseline, same specificity either way.
  const customClass =
    [lookClass, namedStyle?.className, positionClass]
      .filter(Boolean)
      .join(" ") || undefined;

  // `customClass` is an extra HTML class with no WP block support backing
  // it — WordPress's own "custom className" support is what save()
  // actually reads to append arbitrary extra classes, and it only does
  // that when a real `className` attr is present. Without this, wpfg-*
  // was landing in the rendered HTML but nowhere in attrs — the same
  // category of attrs/HTML mismatch this file otherwise guards against,
  // just reintroduced via our own generated class instead of an invented
  // WP-flavored attr.
  const classNameAttr: Record<string, unknown> = customClass
    ? { className: customClass }
    : {};

  // Class order matters here too, not just membership — WordPress's real
  // save() output (confirmed against markup WP's own editor generated
  // natively) places the custom `className` classes right after the base
  // block class, *before* any block-support-generated preset classes
  // (has-text-color, has-{slug}-color, etc.)
  if (level !== undefined) {
    return {
      blockName: "core/heading",
      attrs: { level, ...presetAttrs, ...classNameAttr },
      tagName: `h${level}`,
      className:
        ["wp-block-heading", customClass, presetClasses]
          .filter(Boolean)
          .join(" ") || undefined,
      innerHtml,
    };
  }

  return {
    blockName: "core/paragraph",
    attrs: { ...presetAttrs, ...classNameAttr },
    tagName: "p",
    // Every real core block gets a `wp-block-{name}` base class by
    // default (WordPress's own `get_block_default_classname()`) — the
    // heading branch above already includes its own (`wp-block-heading`),
    // but this branch never did. Without it, a generated `<p>` never
    // matches WP's own CSS reset for paragraph margins, so the browser's
    // raw user-agent default (`margin-block: 1em`) silently applies
    // instead — invisible in normal document flow (just extra
    // whitespace), but a real, visible overlap once a sibling is taken
    // out of flow via `position: absolute` and anchored to an exact
    // Figma-derived offset that doesn't account for the stray margin.
    className:
      ["wp-block-paragraph", customClass, presetClasses]
        .filter(Boolean)
        .join(" ") || undefined,
    innerHtml,
  };
};

/**
 * Shared asset-src resolution, previously inlined only in mapImageLike's
 * `<img src>` — now also needed for a FRAME's own background-image
 * `url(...)`. Same two modes either way: theme mode's live PHP call
 * (`get_stylesheet_directory_uri()`, resolves correctly on any domain/
 * install path at request time) vs. patterns mode's generation-time-known
 * base URL (no PHP execution available there — see ImageSrcMode's doc
 * comment above).
 */
export const resolveAssetSrc = (
  asset: DesignBundleAsset,
  ctx: MapNodeContext,
): string =>
  ctx.imageSrcMode?.kind === "url"
    ? `${ctx.imageSrcMode.baseUrl.replace(/\/$/, "")}/${asset.fileName.replace(/^assets\//, "")}`
    : `<?php echo esc_url( get_stylesheet_directory_uri() ); ?>/assets/${asset.fileName.replace(/^assets\//, "")}`;

const mapImageLike = (
  node: DesignNode,
  ctx: MapNodeContext,
): GeneratedBlock => {
  const asset = node.assetRef ? ctx.assetsById.get(node.assetRef) : undefined;
  if (!asset) {
    warn(
      ctx,
      node.id,
      `${node.type} node has no resolvable asset (assetRef: ${node.assetRef ?? "<none>"}) — rendering a placeholder image.`,
    );
  }

  // Same gap as mapText — leaf IMAGE/VECTOR nodes never got their own
  // layout.sizing/layout.position reproduced (layoutToDeclarations was
  // container-only). core/image's real containing box in the rendered HTML
  // is the <figure> wrapper, not the <img> itself, so the generated class
  // goes on wrapperClassName. An extra wrapper class like this needs a
  // real `className` attr behind it for WordPress's save() to reconstruct
  // it. The image's own node-level opacity is distinct from any fill
  // opacity — an IMAGE/VECTOR leaf has no separate background fill of its
  // own in practice, so only the node-level value is relevant here.
  // paintOrder is threaded into layoutToDeclarations for z-index, same as
  // every other node type.
  const layoutDeclarations = joinStyles(
    layoutToDeclarations(node.layout),
    node.style.opacity !== undefined
      ? `opacity: ${node.style.opacity}`
      : undefined,
    // Same "this leaf builds its own declarations, doesn't go through
    // nodeStyleToDeclarations" reasoning as the opacity line above.
    node.style.blendMode !== undefined
      ? `mix-blend-mode: ${node.style.blendMode}`
      : undefined,
  );
  const nodeClass = nodeClassFor(node.id);
  // "image" as the dedup kind here + a separate, never-deduped position
  // rule — same pattern as mapText/mapContainer below.
  const lookClass = addRule(
    ctx.stylesheet,
    "image",
    nodeClass,
    layoutDeclarations,
  );
  const positionClass = addPositionRule(
    ctx.stylesheet,
    `${nodeClass}-pos`,
    layoutPositionToDeclarations(node.layout, node.paintOrder),
  );
  const customClass =
    [lookClass, positionClass].filter(Boolean).join(" ") || undefined;

  return {
    blockName: "core/image",
    // sizeSlug (and its "size-full" class below) only appears when an
    // asset actually resolved — claiming it unconditionally, regardless of
    // whether `sizeSlug` was set, was itself a real attrs/HTML mismatch.
    //
    // `width`/`height` are deliberately NOT included here, even though an
    // asset's real dimensions are known. Gutenberg's actual core/image
    // save.js (verified directly against WordPress/gutenberg's source)
    // emits an inline `style="width:{n}px;height:{n}px"` on the <img>
    // itself whenever attrs.width/attrs.height are set — our rendered
    // markup never reproduced that inline style, which is exactly the
    // kind of attrs/HTML mismatch that trips the editor's "Attempt
    // Recovery" prompt. Sizing is already fully handled by our own
    // `nodeClass` CSS on the <figure> wrapper (layoutToDeclarations), so
    // these attrs were redundant anyway — dropping them removes the
    // mismatch instead of chasing save()'s inline-style format. The plain
    // HTML width/height attributes below (extraAttrs) are unaffected;
    // those are just CLS hints on the <img> tag, not part of what save()
    // validates against stored attrs.
    attrs: {
      ...(asset ? { sizeSlug: "full" } : {}),
      ...(customClass ? { className: customClass } : {}),
    },
    tagName: "img",
    isVoid: true,
    wrapperTagName: "figure",
    wrapperClassName: [
      asset ? "wp-block-image size-full" : "wp-block-image",
      customClass,
    ]
      .filter(Boolean)
      .join(" "),
    extraAttrs: {
      // Theme mode: a relative or even a hardcoded site-root-absolute path
      // can never correctly know the real domain (or subdirectory install
      // prefix) at generation time. Real WordPress themes solve this by
      // only ever referencing theme-bundled assets from PHP-executed
      // context — a `patterns/*.php` file, where
      // `get_stylesheet_directory_uri()` resolves to the correct, live URL
      // fresh on every request.
      //
      // Patterns mode (see MapNodeContext.imageSrcMode above): a pattern
      // imported via "Import from JSON" is stored post content, not a PHP
      // file — a `<?php ... ?>` tag would render as literal inert text,
      // not execute. There's no live-resolution mechanism available at
      // all in that context, so the caller supplies a generation-time-
      // known base URL instead — documented and loud-by-default, since a
      // guessed path needs to be diagnosable rather than silently wrong.
      // Literal HTML `width=`/`height=` attributes on the <img> are
      // dropped entirely too, not just the JSON attrs. Gutenberg's real
      // core/image save() (verified directly against its current source)
      // NEVER emits HTML width/height attributes on the <img> —
      // dimensions only ever appear as an inline
      // `style="width:...px;height:...px"`, and only when
      // attrs.width/height are set. Since those attrs are already dropped
      // above (so no inline style is expected either), a bare <img
      // src=... alt=.../> with no width/height anywhere is what save()
      // actually reconstructs — the leftover raw HTML attributes here were
      // a second, independent mismatch from the same root cause, and
      // explain why *every* image (not just ones with a custom class)
      // showed "unexpected or invalid content" in the editor. Sizing is
      // still fully enforced by our own `nodeClass` CSS on the <figure>
      // wrapper; losing the img-level width/height hint is a minor,
      // acceptable CLS trade-off against actually validating.
      src: asset ? resolveAssetSrc(asset, ctx) : "",
      alt: "",
    },
  };
};

// Which of Figma's own effect kinds `effectsToDeclarations`
// (styleHelpers.ts) actually turns into CSS, and what data each kind
// needs to do it — kept in sync with that function's own filters so this
// warning below reflects reality instead of a stale blanket "not mapped
// in v1" that used to fire on every node with any effect at all, even
// after most effect kinds were actually being mapped (the warning had
// simply never been updated when the mapping landed).
const isEffectMapped = (effect: DesignBundleEffect): boolean => {
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW")
    return Boolean(effect.hex);
  if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR")
    return typeof effect.blur === "number";
  return false; // any other/future Figma effect kind — genuinely unmapped
};

const mapContainer = (
  node: DesignNode,
  ctx: MapNodeContext,
  mapChild: (child: DesignNode) => GeneratedBlock,
): GeneratedBlock => {
  const solidFill = node.style.fills.find((f) => f.type === "SOLID" && f.hex);
  const backgroundColorSlug = solidFill?.variableRef
    ? ctx.colorSlugByVariableRef?.get(solidFill.variableRef)
    : undefined;
  // The fill actually painted by nodeStyleToDeclarations — first SOLID or
  // GRADIENT entry with a usable color, not SOLID-only.
  const paintableFill = node.style.fills.find(
    (f) => (f.type === "SOLID" || f.type === "GRADIENT") && f.hex,
  );

  const unmappedEffects = node.style.effects.filter((e) => !isEffectMapped(e));
  if (unmappedEffects.length > 0) {
    warn(
      ctx,
      node.id,
      `${unmappedEffects.length} effect(s) not mapped — unsupported effect type or missing required data.`,
    );
  }
  if (node.style.strokes.length > 1) {
    warn(
      ctx,
      node.id,
      "Multiple strokes present — only the first is rendered.",
    );
  }
  if (node.style.fills.length > 1) {
    warn(
      ctx,
      node.id,
      "Multiple fill layers present — only the top paintable fill (solid or gradient) is rendered.",
    );
  }
  if (paintableFill?.type === "GRADIENT" && !paintableFill.gradient) {
    warn(
      ctx,
      node.id,
      "Gradient fill has no CSS-representable geometry (e.g. GRADIENT_DIAMOND) — rendered as a flat fallback color instead of a real gradient.",
    );
  }

  // A container is where absolute-positioned children (their own
  // layout.position, set because *this* node is their parent — see
  // styleHelpers.ts) actually get positioned against. CSS `position:
  // absolute` resolves against the nearest positioned ancestor, which
  // defaults to the viewport/initial containing block if there isn't one —
  // so without this, an absolutely-positioned child would jump to the
  // nearest *other* positioned ancestor (or the page) instead of sitting
  // where it was in Figma, relative to this frame. Skipped when this node
  // is itself absolutely positioned (`node.layout.position` set) — it's
  // already a positioned element in that case (`position: absolute` from
  // layoutToDeclarations), so it's already a valid containing block without
  // also needing `relative`.
  //
  // This used to be gated on `node.layout.mode === "NONE"` — correct for a
  // free-form Figma frame, but too narrow once GROUP nodes started being
  // inlined into their parent (GROUPs get discarded, their children get
  // reparented): a GROUP's own children can carry `layout.position` even
  // when their new parent is a real Auto Layout (HORIZONTAL/VERTICAL)
  // container, since a GROUP has no layout concept of its own and its
  // former children get marked absolute regardless of what kind of parent
  // they land in. A flex container can be `position: relative` without
  // any effect on its normal flex children, so broadening this to "any
  // container with at least one absolutely-positioned child" is safe for
  // the NONE case too — just checking `children` directly instead of
  // inferring it from `mode`.
  const hasAbsoluteChild = node.children.some((child) =>
    Boolean(child.layout.position),
  );
  const needsPositionedAnchor = hasAbsoluteChild && !node.layout.position;

  // A FRAME's own background image (behind its real children — the whole
  // reason this node stayed a FRAME instead of collapsing to a leaf
  // IMAGE, see classifyNodeType in designBundleTree.ts). This goes into
  // the same shared `wpfg-{nodeId}` stylesheet class as background-color/
  // border/corner-radius above — deliberately zero attrs footprint
  // (nothing here claims a `className`/`style` attr for save() to
  // reconstruct, so there's nothing to mismatch, unlike an
  // inline-style-with-no-attrs-backing approach, which would risk the
  // same "unexpected or invalid content" class of bug as any other
  // attrs/HTML mismatch in this file).
  //
  // Crucially this can use a *plain relative path* — no PHP, no
  // `imageSrcMode` branching at all — because CSS `url(...)` inside an
  // external stylesheet resolves relative to *that stylesheet's own
  // location* (the theme root, where `style.css` always lives), not the
  // current page's URL. That's different from `<img src>`, which resolves
  // relative to the *page*, and is why the img case genuinely needs
  // `get_stylesheet_directory_uri()` PHP-resolution while this one
  // doesn't. Since `style.css` is a static file WordPress never
  // PHP-executes, a `<?php ?>` tag embedded here would render as literal
  // dead text — a plain `assets/<file>` path sidesteps that entirely.
  const backgroundAsset = node.backgroundAssetRef
    ? ctx.assetsById.get(node.backgroundAssetRef)
    : undefined;
  if (node.backgroundAssetRef && !backgroundAsset) {
    warn(
      ctx,
      node.id,
      `Node has no resolvable background asset (backgroundAssetRef: ${node.backgroundAssetRef}) — background image omitted.`,
    );
  }
  const backgroundImageDeclaration = backgroundAsset
    ? `background-image: url('assets/${backgroundAsset.fileName.replace(/^assets\//, "")}'); background-size: cover; background-position: center`
    : undefined;

  // Layout (flex/gap/padding/sizing) and any non-preset style (raw fill
  // color, border, corner radius) — no attrs equivalent at all. The old
  // `layout` JSON attr is gone entirely, since WordPress's own layout
  // support generates a container class + stylesheet this project was
  // never reproducing.
  const declarations = joinStyles(
    layoutToDeclarations(node.layout),
    // Matches `!important` on `position: absolute` in
    // `layoutToDeclarations` (styleHelpers.ts) — this element's own
    // `position` here happens to already agree with what Gutenberg's
    // editor CSS wants (`relative`), so there's no confirmed live
    // conflict for this exact declaration today, but defending it too is
    // cheap insurance against some other, not-yet-observed editor rule
    // asserting a different `position` value on a container.
    needsPositionedAnchor ? "position: relative !important" : undefined,
    nodeStyleToDeclarations(node.style, Boolean(backgroundColorSlug)),
    backgroundImageDeclaration,
  );
  const nodeClass = nodeClassFor(node.id);
  // "container" as the dedup kind here + a separate, never-deduped
  // position rule — same pattern as mapText/mapImageLike above.
  const lookClass = addRule(
    ctx.stylesheet,
    "container",
    nodeClass,
    declarations,
  );
  const positionClass = addPositionRule(
    ctx.stylesheet,
    `${nodeClass}-pos`,
    layoutPositionToDeclarations(node.layout, node.paintOrder),
  );
  const customClass =
    [lookClass, positionClass].filter(Boolean).join(" ") || undefined;

  // "has-background"/backgroundColor are only claimed when a real WP
  // preset backs them (attrs.backgroundColor set, which save() correctly
  // reconstructs both the attr and the has-background/has-*-background-color
  // classes from) — a raw/non-preset fill lives purely in customClass
  // above, with no attrs claim, so there's nothing for save() to mismatch.
  // Same as mapText: `customClass` needs a real `className` attr behind
  // it, or WP's save() won't reconstruct it and the block fails
  // validation despite the HTML looking "the same" at a glance.
  const attrs: Record<string, unknown> = {};
  if (backgroundColorSlug) attrs.backgroundColor = backgroundColorSlug;
  if (customClass) attrs.className = customClass;

  const wrapperClassName =
    [
      "wp-block-group",
      customClass,
      backgroundColorSlug
        ? `has-background has-${backgroundColorSlug}-background-color`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  // A childless container — e.g. a purely decorative solid-fill
  // RECTANGLE (a hero-image "dimmer" overlay, confirmed on a real bundle:
  // Figma layer named "Dimmer", 1442x720, solid black fill, zero
  // children) — rendered as `core/group` produces a genuinely empty
  // `<!-- wp:group -->\n<div class="..."></div>\n<!-- /wp:group -->`.
  // WordPress's block editor shows its own "Group blocks together. Select
  // a layout." placeholder for *any* group with zero inner blocks,
  // regardless of the group's own CSS styling — an editor-only UI
  // artifact (front-end rendering is unaffected, `save()` just outputs
  // the stored HTML as-is either way), but one that visually swallows
  // whatever space the decorative element was sized to occupy in every
  // editor/preview surface (Site Editor canvas, "Choose a template"
  // thumbnails, etc.) — confirmed via a real WordPress "Choose a
  // template" screenshot showing an otherwise-correct template rendering
  // almost entirely blank because of exactly this. `core/html` has no
  // such constraint: it's a dynamic block that echoes its stored content
  // verbatim, with no "must have children" semantics and no attrs to
  // validate/mismatch — nothing here claims a `className` attr, since
  // core/html's `save()` never reconstructs anything from attrs at all.
  if (node.children.length === 0) {
    return {
      blockName: "core/html",
      attrs: {},
      tagName: "div",
      className: wrapperClassName,
      innerHtml: "",
    };
  }

  // customClass (className support) before preset classes — same
  // ordering fix as mapText.
  return {
    blockName: "core/group",
    attrs,
    tagName: "div",
    className: wrapperClassName,
    // Recursion goes through the caller-supplied `mapChild` (ultimately
    // core/designTree.ts's walkDesignTree) instead of a direct
    // self-call, so every child is (re-)classified exactly once, in one
    // place.
    children: node.children.map((child) => mapChild(child)),
  };
};

/**
 * A companion fix to templateParts.ts: strips `layout.position` from a
 * node that's about to become the *root* of its own independent rendering
 * context — a design's own content pattern, or an extracted header/footer
 * Template Part (`templateParts.ts`'s `classifyTemplateParts`).
 * `DesignNode.layout.position` is always populated on a bundle's
 * top-level `designs[].root` (Stage 1 has no parent to compare against —
 * see `designBundleTree.ts`'s `buildDesignNode` comment: "Root designs[]
 * entries have no parent, so position is always included there"), and
 * header/footer candidate nodes carry the x/y they had *inside the
 * original page's freeform layout* — neither is meaningful once that node
 * is rendered as its own independent root, no longer nested inside the
 * parent whose coordinate space that position was relative to. Without
 * this, `layoutToDeclarations` turns that leftover value into a real
 * `position: absolute; left/top` on the root itself — tearing the whole
 * page (or the whole header/footer part) out of normal flow using stale
 * coordinates from a structurally different context (e.g. a footer
 * positioned 4500+px down the original full page canvas, now rendered
 * 4500+px below the top of its own standalone Template Part). Only a
 * node's *descendants* — genuinely still nested inside their real Figma
 * parent — should have `position` reproduced as CSS; the root of an
 * independent rendering context should not self-position, though it
 * still needs to remain a valid positioned *ancestor* for any
 * absolutely-positioned children (handled separately in `mapContainer`
 * via `needsPositionedAnchor`, which already treats "no position" as
 * "needs position: relative").
 */
export const asRenderRoot = (node: DesignNode): DesignNode => ({
  ...node,
  layout: { ...node.layout, position: undefined },
});

/**
 * The actual per-node dispatch, extracted to this
 * `PublishTarget["mapNode"]`-shaped signature so `targets/wordpress/
 * index.ts`'s `WordPressTarget` can use it directly as its `mapNode`
 * implementation, with zero duplication. Behaviorally identical to an
 * earlier inline switch that used to live directly inside
 * `mapDesignNode` below — the only difference is that `classification`
 * (computed once, up front, by `core/designTree.ts`'s `classifyNode`) is
 * consulted instead of this function calling `detectForm`/`detectLink`
 * itself, and container recursion goes through the supplied `mapChild`
 * instead of a direct self-call. Exhaustiveness guard in `default`:
 * `DesignNodeType` is a closed union (05-block-mapping.md's type table).
 */
export const dispatchDesignNode = (
  node: DesignNode,
  classification: NodeClassification,
  ctx: MapNodeContext,
  mapChild: (child: DesignNode) => GeneratedBlock,
): GeneratedBlock => {
  switch (node.type) {
    case "TEXT": {
      // A bare `Link / {page}` TEXT node (no wrapping FRAME) renders as a
      // real `<a href="">` instead of a plain paragraph.
      if (classification.detectedLink) {
        return renderLink(classification.detectedLink, ctx);
      }
      return mapText(node, ctx, classification.headingLevel);
    }
    case "IMAGE":
    case "VECTOR":
      return mapImageLike(node, ctx);
    case "FRAME": {
      // A `Form / {Name}` FRAME matching the required Input/Button naming
      // + child-shape convention renders as real form markup instead of
      // falling through to the generic container mapping.
      if (classification.detectedForm) {
        return renderForm(classification.detectedForm, ctx);
      }
      // A `Link / {page}` FRAME (label + optional icon) — checked after
      // Form so a node can't accidentally match both conventions.
      if (classification.detectedLink) {
        return renderLink(classification.detectedLink, ctx);
      }
      return mapContainer(node, ctx, mapChild);
    }
    case "RECTANGLE":
      return mapContainer(node, ctx, mapChild);
    default: {
      warn(
        ctx,
        node.id,
        `Unrecognized node type "${(node as DesignNode).type}" — rendered as an empty group.`,
      );
      return {
        blockName: "core/group",
        attrs: {},
        tagName: "div",
        children: [],
      };
    }
  }
};

/**
 * This is deliberately NOT the real `targets/wordpress/index.ts`
 * `WordPressTarget` — importing that here would create a `blocks/` ->
 * `targets/` -> `blocks/` cycle, since `WordPressTarget` itself is built
 * from this file's own exports (`dispatchDesignNode`). This is a
 * minimal, local stand-in with the same shape, used only to give
 * `walkDesignTree` something to call — `mapNode` is `dispatchDesignNode`
 * either way, so there is exactly one WordPress dispatch implementation
 * regardless of which entry point (this, or the real `WordPressTarget`)
 * a caller goes through.
 */
const wordPressDispatchTarget: PublishTarget<GeneratedBlock, MapNodeContext> = {
  id: "wordpress",
  modes: {},
  mapNode: dispatchDesignNode,
};

/**
 * External signature unchanged — every existing caller
 * (`theme/generateThemeFiles.ts`, `patterns/generatePatternFiles.ts`)
 * needs no changes. Internally now walks through `core/designTree.ts`'s
 * `walkDesignTree` instead of an inline switch — zero behavior change,
 * verified by regenerating and byte-diffing every `TestBundles` bundle's
 * theme + patterns output against a pre-refactor baseline.
 */
export const mapDesignNode = (
  node: DesignNode,
  ctx: MapNodeContext,
): GeneratedBlock =>
  walkDesignTree(
    node,
    wordPressDispatchTarget,
    ctx,
    ctx.textStyles ?? {},
    (nodeId, message) => warn(ctx, nodeId, message),
  );
